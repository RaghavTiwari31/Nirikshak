import hashlib
import json
from datetime import date
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.audit.chain import append_audit
from app.core.db import get_db
from app.ingestion.contract import DATASETS, LOAD_ORDER
from app.ingestion.mapping import MappingError, apply_mapping, suggest_mapping
from app.ingestion.parsers import ParseError, parse_bytes
from app.ingestion.pipeline import IngestError, ingest_bundle, upsert_entity_profiles
from app.models.entities import ColumnMapping, Entity, Submission
from app.models.enums import UserRole
from app.models.system import AppUser
from app.schemas.ingest import (
    ContractDataset,
    ContractField,
    JsonSubmission,
    MappingIn,
    MappingOut,
    PreviewOut,
    SubmissionDetail,
    SubmissionPage,
    SubmissionSummary,
    UploadResult,
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
SAMPLE_ROWS = 5

router = APIRouter(tags=["ingestion"], dependencies=[Depends(get_current_user)])
can_submit = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.EXAMINER)


def _bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _read_upload(file: UploadFile) -> bytes:
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    return content


def _dataset(key: str) -> Any:
    spec = DATASETS.get(key)
    if spec is None:
        raise _bad_request(f"Unknown dataset '{key}'")
    return spec


def _summary(sub: Submission, entity: Entity) -> dict[str, Any]:
    datasets = (sub.dq_report_json or {}).get("datasets", [])
    return {
        "id": sub.id,
        "entity_code": entity.code,
        "entity_name": entity.display_name,
        "period_start": sub.period_start,
        "period_end": sub.period_end,
        "received_at": sub.received_at,
        "source_format": sub.source_format,
        "status": sub.status,
        "row_counts": sub.row_counts_json or {},
        "errors": sum(
            sum(d.get("errors", {}).values()) + (1 if d.get("fatal") else 0) for d in datasets
        ),
        "warnings": sum(sum(d.get("warnings", {}).values()) for d in datasets),
    }


def _detail(sub: Submission, entity: Entity) -> SubmissionDetail:
    return SubmissionDetail(
        **_summary(sub, entity), file_sha256=sub.file_sha256, dq_report=sub.dq_report_json or {}
    )


@router.get("/ingest/contract", response_model=list[ContractDataset])
def contract() -> list[ContractDataset]:
    return [
        ContractDataset(
            key=d.key,
            label=d.label,
            description=d.description,
            per_entity=d.per_entity,
            fields=[
                ContractField(
                    name=f.name,
                    kind=f.kind,
                    required=f.required,
                    description=f.description,
                    enum=list(f.enum) if f.enum else None,
                    pseudonymized=f.pseudonymize is not None,
                )
                for f in d.fields
            ],
        )
        for d in DATASETS.values()
    ]


@router.post("/ingest/preview", response_model=PreviewOut)
def preview(file: UploadFile = File(...), dataset: str = Form(...)) -> PreviewOut:
    spec = _dataset(dataset)
    content = _read_upload(file)
    try:
        df, fmt = parse_bytes(content, file.filename)
    except ParseError as exc:
        raise _bad_request(str(exc)) from exc
    mapping = suggest_mapping(list(df.columns), spec)
    sample = df.head(SAMPLE_ROWS).astype(object).where(df.head(SAMPLE_ROWS).notna(), None)
    return PreviewOut(
        filename=file.filename or "upload",
        dataset=dataset,
        source_format=fmt,
        sha256=hashlib.sha256(content).hexdigest(),
        row_count=len(df),
        columns=list(df.columns),
        sample_rows=[
            {k: (None if v is None else str(v)) for k, v in r.items()}
            for r in sample.to_dict("records")
        ],
        suggested_mapping=mapping,
        unmapped_required=[f for f in spec.required_fields if f not in mapping],
    )


@router.post("/ingest/upload", response_model=UploadResult)
def upload(
    file: UploadFile = File(...),
    dataset: str = Form(...),
    mapping: str = Form(..., description='JSON {"canonical_field": "source column"}'),
    entity_code: str | None = Form(None),
    period_start: date | None = Form(None),
    period_end: date | None = Form(None),
    timezone: str = Form("Asia/Kolkata"),
    save_mapping_as: str | None = Form(None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(can_submit),
) -> UploadResult:
    spec = _dataset(dataset)
    try:
        mapping_dict = json.loads(mapping)
        if not isinstance(mapping_dict, dict):
            raise ValueError
    except ValueError as exc:
        raise _bad_request("mapping must be a JSON object") from exc
    content = _read_upload(file)
    try:
        df, fmt = parse_bytes(content, file.filename)
        frame = apply_mapping(df, mapping_dict, spec)
    except (ParseError, MappingError) as exc:
        raise _bad_request(str(exc)) from exc

    try:
        if dataset == "entity_profile":
            result = upsert_entity_profiles(db, frame)
            append_audit(
                db,
                actor=user.username,
                action="entity_profile.upsert",
                payload={
                    "codes": result.entity_codes,
                    "sha256": hashlib.sha256(content).hexdigest(),
                },
            )
            _save_mapping(db, save_mapping_as, dataset, None, fmt, mapping_dict, user)
            db.commit()
            return UploadResult(
                kind="entity_profile",
                entity_codes=result.entity_codes,
                profile_report=result.report.to_dict(),
            )
        if not (entity_code and period_start and period_end):
            raise _bad_request("entity_code, period_start and period_end are required")
        sub = ingest_bundle(
            db,
            entity_code=entity_code,
            period_start=period_start,
            period_end=period_end,
            frames={dataset: frame},
            source_format=fmt,
            actor=user.username,
            file_sha256=hashlib.sha256(content).hexdigest(),
            assume_tz=timezone,
        )
        _save_mapping(db, save_mapping_as, dataset, sub.entity_id, fmt, mapping_dict, user)
        db.commit()
    except IngestError as exc:
        db.rollback()
        raise _bad_request(str(exc)) from exc
    entity = db.get(Entity, sub.entity_id)
    assert entity is not None
    return UploadResult(kind="submission", submission=_detail(sub, entity))


def _save_mapping(
    db: Session,
    name: str | None,
    dataset: str,
    entity_id: int | None,
    fmt: str,
    mapping: dict[str, str],
    user: AppUser,
) -> None:
    if not name:
        return
    row = ColumnMapping(
        name=name[:64],
        dataset=dataset,
        entity_id=entity_id,
        source_format=fmt,
        mapping_json=mapping,
    )
    db.add(row)
    db.flush()
    append_audit(db, actor=user.username, action="mapping.create", object_ref=f"mapping:{row.id}")


@router.post("/ingest/json", response_model=SubmissionDetail)
def ingest_json(
    body: JsonSubmission, db: Session = Depends(get_db), user: AppUser = Depends(can_submit)
) -> SubmissionDetail:
    unknown = set(body.datasets) - set(LOAD_ORDER)
    if unknown:
        raise _bad_request(f"Unknown datasets: {', '.join(sorted(unknown))}")
    frames = {k: pd.DataFrame.from_records(v) for k, v in body.datasets.items() if v}
    raw = body.model_dump_json().encode()
    try:
        sub = ingest_bundle(
            db,
            entity_code=body.entity_code,
            period_start=body.period_start,
            period_end=body.period_end,
            frames=frames,
            source_format="api",
            actor=user.username,
            file_sha256=hashlib.sha256(raw).hexdigest(),
            assume_tz=body.timezone,
        )
        db.commit()
    except IngestError as exc:
        db.rollback()
        raise _bad_request(str(exc)) from exc
    entity = db.get(Entity, sub.entity_id)
    assert entity is not None
    return _detail(sub, entity)


@router.get("/submissions", response_model=SubmissionPage)
def list_submissions(
    entity_code: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> SubmissionPage:
    q = select(Submission, Entity).join(Entity, Entity.id == Submission.entity_id)
    if entity_code:
        q = q.where(Entity.code == entity_code)
    if status_filter:
        q = q.where(Submission.status == status_filter)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.order_by(Submission.id.desc()).limit(limit).offset(offset)).all()
    return SubmissionPage(items=[SubmissionSummary(**_summary(s, e)) for s, e in rows], total=total)


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
def get_submission(submission_id: int, db: Session = Depends(get_db)) -> SubmissionDetail:
    row = db.execute(
        select(Submission, Entity)
        .join(Entity, Entity.id == Submission.entity_id)
        .where(Submission.id == submission_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found")
    return _detail(*row)


@router.get("/mappings", response_model=list[MappingOut])
def list_mappings(dataset: str | None = None, db: Session = Depends(get_db)) -> list[MappingOut]:
    q = select(ColumnMapping).order_by(ColumnMapping.created_at.desc())
    if dataset:
        q = q.where(ColumnMapping.dataset == dataset)
    return [MappingOut.model_validate(m) for m in db.scalars(q)]


@router.post("/mappings", response_model=MappingOut, status_code=status.HTTP_201_CREATED)
def create_mapping(
    body: MappingIn, db: Session = Depends(get_db), user: AppUser = Depends(can_submit)
) -> MappingOut:
    spec = _dataset(body.dataset)
    unknown = set(body.mapping) - set(spec.fields_by_name)
    if unknown:
        raise _bad_request(f"Unknown fields: {', '.join(sorted(unknown))}")
    entity_id = None
    if body.entity_code:
        entity_id = db.scalar(select(Entity.id).where(Entity.code == body.entity_code))
        if entity_id is None:
            raise _bad_request(f"Unknown entity '{body.entity_code}'")
    row = ColumnMapping(
        name=body.name,
        dataset=body.dataset,
        entity_id=entity_id,
        source_format=body.source_format,
        mapping_json=body.mapping,
    )
    db.add(row)
    db.flush()
    append_audit(db, actor=user.username, action="mapping.create", object_ref=f"mapping:{row.id}")
    db.commit()
    return MappingOut.model_validate(row)

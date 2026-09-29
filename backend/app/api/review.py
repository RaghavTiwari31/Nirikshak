import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.api.records import fetch_records
from app.api.scores import latest_run_id
from app.audit.chain import append_audit
from app.core.db import get_db
from app.models.analysis import EntityScore, ReviewSample
from app.models.entities import Entity
from app.models.enums import UserRole
from app.models.system import AppUser
from app.schemas.scoring import PackDetail, PackSummary, SampleOut, SampleUpdate

router = APIRouter(prefix="/review", tags=["review"], dependencies=[Depends(get_current_user)])
can_review = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.EXAMINER)

CSV_FIELDS = [
    "sample_id",
    "stratum",
    "reason",
    "record_type",
    "record_ref",
    "severity",
    "category",
    "created_or_opened",
    "disposition_or_status",
    "outcome",
    "reviewer",
]


FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: object) -> object:
    """Neutralise spreadsheet formula injection: exported values include entity-submitted
    text (rule names, case references), and a cell like `=HYPERLINK(...)` would otherwise
    execute when a supervisor opens the file. Numbers pass through unchanged."""
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def _require_run(db: Session, run_id: int | None) -> int:
    run_id = run_id or latest_run_id(db)
    if run_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed analysis run")
    return run_id


def _summary(e: Entity, score: EntityScore, samples: list[ReviewSample]) -> PackSummary:
    directed = [s for s in samples if s.stratum != "random_control"]
    control = [s for s in samples if s.stratum == "random_control"]
    return PackSummary(
        entity_code=e.code,
        entity_name=e.display_name,
        rank=score.rank,
        sai=score.sai,
        samples=len(samples),
        directed=len(directed),
        control=len(control),
        reviewed=sum(1 for s in samples if s.outcome),
        confirmed_directed=sum(1 for s in directed if s.outcome == "issue_confirmed"),
        confirmed_control=sum(1 for s in control if s.outcome == "issue_confirmed"),
    )


def _load_pack(
    db: Session, run_id: int, code: str
) -> tuple[Entity, EntityScore, list[ReviewSample]]:
    row = db.execute(
        select(Entity, EntityScore)
        .join(EntityScore, EntityScore.entity_id == Entity.id)
        .where(Entity.code == code, EntityScore.run_id == run_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entity not scored in this run")
    samples = list(
        db.scalars(
            select(ReviewSample)
            .where(ReviewSample.run_id == run_id, ReviewSample.entity_id == row[0].id)
            .order_by(ReviewSample.id)
        )
    )
    if not samples:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No review pack for this entity")
    return row[0], row[1], samples


@router.get("/packs", response_model=list[PackSummary])
def list_packs(run_id: int | None = None, db: Session = Depends(get_db)) -> list[PackSummary]:
    run_id = _require_run(db, run_id)
    samples: dict[int, list[ReviewSample]] = {}
    for s in db.scalars(select(ReviewSample).where(ReviewSample.run_id == run_id)):
        samples.setdefault(s.entity_id, []).append(s)
    rows = db.execute(
        select(Entity, EntityScore)
        .join(EntityScore, EntityScore.entity_id == Entity.id)
        .where(EntityScore.run_id == run_id, Entity.id.in_(samples))
        .order_by(EntityScore.rank)
    ).all()
    return [_summary(e, sc, samples[e.id]) for e, sc in rows]


@router.get("/packs/{code}", response_model=PackDetail)
def get_pack(code: str, run_id: int | None = None, db: Session = Depends(get_db)) -> PackDetail:
    run_id = _require_run(db, run_id)
    entity, score, samples = _load_pack(db, run_id, code)
    records = fetch_records(db, ((s.record_type, s.record_id) for s in samples))
    return PackDetail(
        **_summary(entity, score, samples).model_dump(),
        run_id=run_id,
        items=[
            SampleOut(
                id=s.id,
                record_type=s.record_type,
                record_id=s.record_id,
                stratum=s.stratum,
                reason=s.reason,
                reviewed_at=s.reviewed_at,
                reviewer=s.reviewer,
                outcome=s.outcome,
                record=records.get((s.record_type, s.record_id)),
            )
            for s in samples
        ],
    )


@router.get("/packs/{code}/export.csv")
def export_pack(
    code: str,
    run_id: int | None = None,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> StreamingResponse:
    run_id = _require_run(db, run_id)
    _entity, _score, samples = _load_pack(db, run_id, code)
    # Exports take CSE records off the system, so each one is on the audit trail.
    append_audit(
        db,
        actor=user.username,
        action="review.export",
        object_ref=f"entity:{code}",
        payload={"run_id": run_id, "records": len(samples)},
    )
    db.commit()
    records = fetch_records(db, ((s.record_type, s.record_id) for s in samples))
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for s in samples:
        rec = records.get((s.record_type, s.record_id), {})
        writer.writerow(
            {
                k: csv_safe(v)
                for k, v in {
                    "sample_id": s.id,
                    "stratum": s.stratum,
                    "reason": s.reason,
                    "record_type": s.record_type,
                    "record_ref": rec.get("source_ref"),
                    "severity": rec.get("severity") or rec.get("priority"),
                    "category": rec.get("category"),
                    "created_or_opened": rec.get("created_at") or rec.get("opened_at"),
                    "disposition_or_status": rec.get("disposition") or rec.get("status"),
                    "outcome": s.outcome,
                    "reviewer": s.reviewer,
                }.items()
            }
        )
    filename = f"nirikshak_review_{code}_run{run_id}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/samples/{sample_id}", response_model=SampleOut)
def record_outcome(
    sample_id: int,
    body: SampleUpdate,
    db: Session = Depends(get_db),
    user: AppUser = Depends(can_review),
) -> SampleOut:
    sample = db.get(ReviewSample, sample_id)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found")
    sample.outcome = body.outcome
    sample.reviewer = user.username
    sample.reviewed_at = datetime.now(UTC)
    append_audit(
        db,
        actor=user.username,
        action="review.outcome",
        object_ref=f"sample:{sample.id}",
        payload={"outcome": body.outcome, "stratum": sample.stratum},
    )
    db.commit()
    rec = fetch_records(db, [(sample.record_type, sample.record_id)])
    return SampleOut(
        id=sample.id,
        record_type=sample.record_type,
        record_id=sample.record_id,
        stratum=sample.stratum,
        reason=sample.reason,
        reviewed_at=sample.reviewed_at,
        reviewer=sample.reviewer,
        outcome=sample.outcome,
        record=rec.get((sample.record_type, sample.record_id)),
    )

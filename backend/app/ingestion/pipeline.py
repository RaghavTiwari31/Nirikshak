"""Submission ingestion: validate -> pseudonymise -> load -> data-quality report."""

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import pandas as pd
import psycopg
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.audit.chain import append_audit
from app.core.pseudonymize import pseudonymize
from app.ingestion import loader
from app.ingestion.contract import DATASETS, ENTITY_PROFILE, LOAD_ORDER, DatasetSpec
from app.ingestion.validate import DatasetReport, validate_dataset
from app.models.entities import Entity, Submission
from app.models.enums import SubmissionStatus

logger = logging.getLogger(__name__)

DEFAULT_TZ = "Asia/Kolkata"


class IngestError(ValueError):
    pass


@dataclass
class ProfileResult:
    report: DatasetReport
    entity_codes: list[str]


def _pseudonymize_columns(df: pd.DataFrame, spec: DatasetSpec) -> pd.DataFrame:
    for f in spec.fields:
        if f.pseudonymize and f.name in df.columns:
            uniques = df[f.name].dropna().unique()
            tokens = {u: pseudonymize(str(u), namespace=f.pseudonymize) for u in uniques}
            df[f.name] = df[f.name].map(tokens).astype("string")
    return df


def upsert_entity_profiles(db: Session, raw: pd.DataFrame) -> ProfileResult:
    clean, report = validate_dataset(raw, ENTITY_PROFILE)
    if report.fatal:
        raise IngestError(report.fatal)
    rows: list[dict[str, Any]] = []
    for r in clean.to_dict("records"):
        sla = {
            sev: float(r[f"declared_sla_hours_{sev}"])
            for sev in ("critical", "high", "medium", "low")
            if not pd.isna(r[f"declared_sla_hours_{sev}"])
        }
        rows.append(
            {
                "code": r["entity_code"],
                "display_name": r["display_name"],
                "sector": r["sector"],
                "size_tier": r["size_tier"],
                "soc_model": r["soc_model"],
                "declared_24x7": bool(r["declared_24x7"]),
                "declared_sla_json": sla,
                "declared_mttr_hours": None
                if pd.isna(r["declared_mttr_hours"])
                else float(r["declared_mttr_hours"]),
                "declared_coverage_pct": None
                if pd.isna(r["declared_coverage_pct"])
                else float(r["declared_coverage_pct"]),
            }
        )
    if rows:
        stmt = insert(Entity).values(rows)
        cols = {c: stmt.excluded[c] for c in rows[0] if c != "code"}
        db.execute(stmt.on_conflict_do_update(index_elements=["code"], set_=cols))
    return ProfileResult(report=report, entity_codes=[r["code"] for r in rows])


def _overall_status(reports: list[DatasetReport]) -> SubmissionStatus:
    if any(r.fatal for r in reports) or all(r.rows_accepted == 0 for r in reports):
        return SubmissionStatus.REJECTED
    if any(r.errors or r.warnings for r in reports):
        return SubmissionStatus.ACCEPTED_WITH_WARNINGS
    return SubmissionStatus.ACCEPTED


def ingest_bundle(
    db: Session,
    *,
    entity_code: str,
    period_start: date,
    period_end: date,
    frames: dict[str, pd.DataFrame],
    source_format: str,
    actor: str,
    file_sha256: str | None = None,
    assume_tz: str = DEFAULT_TZ,
    received_at: datetime | None = None,
) -> Submission:
    """Ingest one submission (any subset of datasets) for one entity.

    Flushes but does not commit, so the caller controls the transaction.
    """
    unknown = set(frames) - set(LOAD_ORDER)
    if unknown:
        raise IngestError(f"Unknown datasets: {', '.join(sorted(unknown))}")
    if period_end < period_start:
        raise IngestError("period_end is before period_start")
    entity = db.scalar(select(Entity).where(Entity.code == entity_code))
    if entity is None:
        raise IngestError(f"Unknown entity '{entity_code}'. Upload its entity profile first.")

    submission = Submission(
        entity_id=entity.id,
        period_start=period_start,
        period_end=period_end,
        received_at=received_at or datetime.now(UTC),
        source_format=source_format,
        file_sha256=file_sha256,
        status=SubmissionStatus.PROCESSING,
    )
    db.add(submission)
    db.flush()

    # COPY needs the raw psycopg connection; it shares the session's transaction.
    raw = db.connection().connection.driver_connection
    assert raw is not None
    cur: psycopg.Cursor[Any] = raw.cursor()
    reports: list[DatasetReport] = []
    row_counts: dict[str, int] = {}
    for key in LOAD_ORDER:
        if key not in frames:
            continue
        spec = DATASETS[key]
        clean, report = validate_dataset(
            frames[key], spec, assume_tz=assume_tz, period=(period_start, period_end)
        )
        reports.append(report)
        if report.fatal or clean.empty:
            continue
        clean = _pseudonymize_columns(clean, spec)
        match key:
            case "assets":
                stats = loader.load_assets(cur, entity.id, clean)
            case "cases":
                stats = loader.load_cases(cur, entity.id, submission.id, clean)
            case "alerts":
                stats = loader.load_alerts(cur, entity.id, submission.id, clean, report)
            case "case_events":
                stats = loader.load_case_events(cur, entity.id, clean, report)
            case "escalations":
                stats = loader.load_escalations(cur, entity.id, clean, report)
            case "source_volume":
                stats = loader.load_source_volume(cur, entity.id, clean, report)
        row_counts[key] = stats.rows_written

    status = _overall_status(reports) if reports else SubmissionStatus.REJECTED
    submission.status = status
    submission.row_counts_json = row_counts
    submission.dq_report_json = {
        "status": status.value,
        "assume_tz": assume_tz,
        "datasets": [r.to_dict() for r in reports],
    }
    append_audit(
        db,
        actor=actor,
        action="submission.ingest",
        object_ref=f"submission:{submission.id}",
        payload={
            "entity": entity_code,
            "status": status.value,
            "rows": row_counts,
            "sha256": file_sha256,
        },
    )
    db.flush()
    logger.info(
        "Ingested submission %s for %s: %s %s", submission.id, entity_code, status.value, row_counts
    )
    return submission

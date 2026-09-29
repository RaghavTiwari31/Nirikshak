import contextlib
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.config import load_config
from app.analytics.evaluation import evaluate
from app.analytics.runner import RunError, create_run, execute_run
from app.analytics.signals import REGISTRY
from app.api.deps import get_current_user, require_roles
from app.api.records import fetch_records
from app.core.db import get_db
from app.models.analysis import AnalysisRun, Finding, FindingEvidence
from app.models.entities import Entity
from app.models.enums import RunStatus, UserRole
from app.models.system import AppUser
from app.schemas.analysis import (
    EvaluationOut,
    EvidencePage,
    EvidenceRow,
    FindingDetail,
    FindingOut,
    FindingPage,
    PeerPoint,
    RunCreate,
    RunDetail,
    RunOut,
    SignalLibrary,
    SignalOut,
    SignalScoreOut,
)

router = APIRouter(tags=["analysis"], dependencies=[Depends(get_current_user)])
can_run = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR)


def _run_out(run: AnalysisRun, findings: int) -> dict[str, Any]:
    return {
        "id": run.id,
        "status": run.status,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "triggered_by": run.triggered_by,
        "code_version": run.code_version,
        "config_sha256": run.config_sha256,
        "data_sha256": run.data_sha256,
        "window_start": run.params_json["window_start"],
        "window_end": run.params_json["window_end"],
        "progress": run.progress_json or {},
        "error": run.error,
        "findings": findings,
    }


def _latest_run_id(db: Session) -> int | None:
    return db.scalar(
        select(func.max(AnalysisRun.id)).where(AnalysisRun.status == RunStatus.SUCCEEDED)
    )


def _get_run(db: Session, run_id: int) -> AnalysisRun:
    run = db.get(AnalysisRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


@router.get("/signals", response_model=SignalLibrary)
def signal_library() -> SignalLibrary:
    cfg = load_config()
    return SignalLibrary(
        config_version=cfg.version,
        config_sha256=cfg.sha256,
        signals=[
            SignalOut(**s.model_dump(exclude={"narrative"}))
            for s in cfg.signals
            if s.id in REGISTRY
        ],
    )


@router.post("/runs", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def start_run(
    body: RunCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: AppUser = Depends(can_run),
) -> RunOut:
    window = None
    if body.window_start and body.window_end:
        if body.window_end <= body.window_start:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "window_end must be after start")
        window = (body.window_start, body.window_end)
    try:
        run = create_run(db, window=window, actor=user.username)
    except RunError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    background.add_task(_execute_quietly, run.id)
    return RunOut(**_run_out(run, 0))


def _execute_quietly(run_id: int) -> None:
    # execute_run records failures on the run row and in the audit log, and logs them.
    with contextlib.suppress(Exception):
        execute_run(run_id)


@router.get("/runs", response_model=list[RunOut])
def list_runs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)) -> list[RunOut]:
    counts: dict[int, int] = {
        rid: n
        for rid, n in db.execute(select(Finding.run_id, func.count()).group_by(Finding.run_id))
    }
    runs = db.scalars(select(AnalysisRun).order_by(AnalysisRun.id.desc()).limit(limit))
    return [RunOut(**_run_out(r, counts.get(r.id, 0))) for r in runs]


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: int, db: Session = Depends(get_db)) -> RunDetail:
    run = _get_run(db, run_id)
    by_signal: dict[str, int] = {
        sig: n
        for sig, n in db.execute(
            select(Finding.signal_id, func.count())
            .where(Finding.run_id == run_id)
            .group_by(Finding.signal_id)
        )
    }
    flagged = (
        db.scalar(
            select(func.count(func.distinct(Finding.entity_id))).where(Finding.run_id == run_id)
        )
        or 0
    )
    return RunDetail(
        **_run_out(run, sum(by_signal.values())),
        findings_by_signal=by_signal,
        entities_flagged=flagged,
    )


@router.get("/runs/{run_id}/evaluation", response_model=EvaluationOut)
def run_evaluation(run_id: int, db: Session = Depends(get_db)) -> EvaluationOut:
    _get_run(db, run_id)
    ev = evaluate(db, run_id)
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No synthetic ground truth available")
    return EvaluationOut(
        run_id=ev.run_id,
        healthy_entities=ev.healthy_entities,
        healthy_flagged=ev.healthy_flagged,
        weak_entities=ev.weak_entities,
        weak_caught=ev.weak_caught,
        ndcg_at_10=ev.ndcg_at_10,
        precision_at_10=ev.precision_at_10,
        signals=[
            SignalScoreOut(
                signal_id=s.signal_id,
                planted=s.planted,
                flagged=s.flagged,
                true_pos=s.true_pos,
                precision=s.precision,
                recall=s.recall,
                false_pos=s.false_pos,
                missed=s.missed,
            )
            for s in ev.signals
        ],
    )


def finding_out(f: Finding, e: Entity) -> dict[str, Any]:
    return {
        "id": f.id,
        "run_id": f.run_id,
        "entity_id": e.id,
        "entity_code": e.code,
        "entity_name": e.display_name,
        "signal_id": f.signal_id,
        "family": f.family,
        "capability": f.capability,
        "severity": f.severity,
        "confidence": f.confidence,
        "metric_value": f.metric_value,
        "peer_percentile": f.peer_percentile,
        "title": f.title,
        "narrative": f.narrative,
        "status": f.status,
    }


@router.get("/findings", response_model=FindingPage)
def list_findings(
    run_id: int | None = None,
    entity_code: str | None = None,
    signal_id: str | None = None,
    family: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> FindingPage:
    run_id = run_id or _latest_run_id(db)
    if run_id is None:
        return FindingPage(items=[], total=0, run_id=None)
    q = (
        select(Finding, Entity)
        .join(Entity, Entity.id == Finding.entity_id)
        .where(Finding.run_id == run_id)
    )
    if entity_code:
        q = q.where(Entity.code == entity_code)
    if signal_id:
        q = q.where(Finding.signal_id == signal_id)
    if family:
        q = q.where(Finding.family == family)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(
        q.order_by(Finding.severity.desc(), Finding.confidence.desc(), Finding.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return FindingPage(
        items=[FindingOut(**finding_out(f, e)) for f, e in rows], total=total, run_id=run_id
    )


@router.get("/findings/{finding_id}", response_model=FindingDetail)
def get_finding(finding_id: int, db: Session = Depends(get_db)) -> FindingDetail:
    row = db.execute(
        select(Finding, Entity)
        .join(Entity, Entity.id == Finding.entity_id)
        .where(Finding.id == finding_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")
    f, e = row
    run = _get_run(db, f.run_id)
    base = (run.summary_json or {}).get("baselines", {}).get(f.signal_id, {})
    peers = [PeerPoint(entity_code=k, value=v) for k, v in sorted(base.get("values", {}).items())]
    n_evidence = (
        db.scalar(
            select(func.count())
            .select_from(FindingEvidence)
            .where(FindingEvidence.finding_id == f.id)
        )
        or 0
    )
    details = {k: v for k, v in (f.details_json or {}).items()}
    return FindingDetail(
        **finding_out(f, e),
        signal_version=f.signal_version,
        details=details,
        peers=peers,
        peer_median=details.get("peer_median"),
        evidence_count=n_evidence,
    )


@router.get("/findings/{finding_id}/evidence", response_model=EvidencePage)
def finding_evidence(
    finding_id: int,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> EvidencePage:
    base = select(FindingEvidence).where(FindingEvidence.finding_id == finding_id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = list(db.scalars(base.order_by(FindingEvidence.id).limit(limit).offset(offset)))
    records = fetch_records(db, ((r.record_type, r.record_id) for r in rows))
    return EvidencePage(
        total=total,
        items=[
            EvidenceRow(
                id=r.id,
                record_type=r.record_type,
                record_id=r.record_id,
                note=r.note,
                record=records.get((r.record_type, r.record_id or -1)),
            )
            for r in rows
        ],
    )

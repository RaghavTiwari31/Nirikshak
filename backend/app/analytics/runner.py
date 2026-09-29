"""Analysis runs: measure every entity, compare with peers, write findings.

A run is reproducible: its manifest records the code version, the SHA-256 of the signal
configuration and a SHA-256 over the submissions it read.
"""

import gc
import hashlib
import json
import logging
import os
import subprocess
import time
import traceback
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import numpy as np
from sqlalchemy import insert, select, text
from sqlalchemy.orm import Session

from app import __version__
from app.analytics.config import AnalyticsConfig, load_config
from app.analytics.data import (
    EntityInfo,
    build_context,
    default_window,
    list_entities,
    load_entity,
)
from app.analytics.features import monthly_features, window_features
from app.analytics.narrative import render
from app.analytics.sampling import build_pack, select_entities
from app.analytics.scoring import EntityScoreResult, ScoredFinding, rank, score_entity
from app.analytics.signals import REGISTRY, PopulationSignal
from app.analytics.signals.base import EntityProfile, Measure, Signal
from app.analytics.stats import Baseline, baseline
from app.audit.chain import append_audit
from app.core.db import SessionLocal
from app.models.analysis import (
    AnalysisRun,
    EntityPeriodFeature,
    EntityScore,
    Finding,
    FindingEvidence,
    ReviewSample,
)
from app.models.enums import RunStatus

logger = logging.getLogger(__name__)
STALE_RUN_SECONDS = 3600
CONTROL_POOL = 40  # random alert ids kept per entity for review-pack controls


class RunError(RuntimeError):
    pass


def code_version() -> str:
    for var in ("SATSA_CODE_VERSION", "RENDER_GIT_COMMIT"):
        if os.environ.get(var):
            return os.environ[var][:40]
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        ).stdout.strip()
        return f"{__version__}+{sha}"
    except (OSError, subprocess.SubprocessError):
        return __version__


def create_run(db: Session, *, window: tuple[date, date] | None, actor: str) -> AnalysisRun:
    """Queue a run. Refuses if another run is still active (one at a time on small hosts)."""
    active = db.scalar(
        select(AnalysisRun).where(AnalysisRun.status.in_([RunStatus.QUEUED, RunStatus.RUNNING]))
    )
    if active is not None:
        started = active.started_at or datetime.now(UTC)
        if (datetime.now(UTC) - started).total_seconds() < STALE_RUN_SECONDS:
            raise RunError(f"Run {active.id} is still {active.status}")
        active.status = RunStatus.FAILED
        active.error = "Marked stale by a newer run"
    cfg = load_config()
    if window is None:
        window = default_window(db.connection())
        if window is None:
            raise RunError("No submissions to analyse")
    run = AnalysisRun(
        status=RunStatus.QUEUED,
        code_version=code_version(),
        config_sha256=cfg.sha256,
        params_json={
            "window_start": window[0].isoformat(),
            "window_end": window[1].isoformat(),
            "config_version": cfg.version,
        },
        progress_json={"done": 0, "total": 0},
        triggered_by=actor,
    )
    db.add(run)
    db.flush()
    append_audit(
        db, actor=actor, action="run.create", object_ref=f"run:{run.id}", payload=run.params_json
    )
    db.commit()
    return run


def _data_sha(db: Session, window: tuple[date, date]) -> str:
    rows = db.execute(
        text(
            """
        SELECT id, entity_id, period_start, period_end, status, coalesce(file_sha256, ''),
               row_counts_json::text
        FROM submission WHERE period_end >= :s AND period_start < :e ORDER BY id
        """
        ),
        {"s": window[0], "e": window[1]},
    ).all()
    payload = json.dumps([[str(c) for c in r] for r in rows], separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


@dataclass
class _Measured:
    entity_id: int
    code: str
    name: str
    measure: Measure


def execute_run(run_id: int, progress: Any = None) -> None:
    """Run a queued analysis in its own session (safe to call from a background task)."""
    say = progress or (lambda _msg: None)
    with SessionLocal() as db:
        run = db.get(AnalysisRun, run_id)
        if run is None:
            raise RunError(f"Run {run_id} not found")
        try:
            _execute(db, run, load_config(), say)
        except Exception as exc:
            db.rollback()
            run = db.get(AnalysisRun, run_id)
            assert run is not None
            run.status = RunStatus.FAILED
            run.error = f"{exc.__class__.__name__}: {exc}"
            run.finished_at = datetime.now(UTC)
            append_audit(
                db,
                actor="system",
                action="run.failed",
                object_ref=f"run:{run_id}",
                payload={"error": run.error},
            )
            db.commit()
            logger.error("Run %s failed:\n%s", run_id, traceback.format_exc())
            raise


def _execute(db: Session, run: AnalysisRun, cfg: AnalyticsConfig, say: Any) -> None:
    t0 = time.perf_counter()
    window = (
        date.fromisoformat(run.params_json["window_start"]),
        date.fromisoformat(run.params_json["window_end"]),
    )
    run.status = RunStatus.RUNNING
    run.started_at = datetime.now(UTC)
    run.data_sha256 = _data_sha(db, window)
    db.commit()

    conn = db.connection()
    ctx = build_context(conn, window, cfg.timezone, cfg.default_sla_hours)
    all_signals = [REGISTRY[s.id](s, ctx) for s in cfg.signals if s.id in REGISTRY]
    signals = [s for s in all_signals if not isinstance(s, PopulationSignal)]
    population = [s for s in all_signals if isinstance(s, PopulationSignal)]
    entities = list_entities(conn)
    measured: dict[str, list[_Measured]] = {s.cfg.id: [] for s in all_signals}
    profiles: dict[str, EntityProfile] = {}
    controls: dict[int, list[int]] = {}
    errors: list[str] = []

    # 1. Measure every entity, one at a time (memory stays flat).
    for i, info in enumerate(entities, start=1):
        # Progress is committed per entity, and a commit releases the session's connection.
        frame = load_entity(db.connection(), info, ctx)
        frame.features = monthly_features(frame, ctx)
        for sig in signals:
            try:
                m = sig.measure(frame)
            except Exception as exc:  # one broken signal must not sink the whole run
                errors.append(f"{sig.cfg.id} on {info.code}: {exc.__class__.__name__}: {exc}")
                logger.exception("Signal %s failed on %s", sig.cfg.id, info.code)
                continue
            measured[sig.cfg.id].append(_Measured(info.id, info.code, info.display_name, m))
        db.execute(
            insert(EntityPeriodFeature),
            [
                {"run_id": run.id, "entity_id": info.id, "period": m, "feature_json": v}
                for m, v in frame.features.items()
            ],
        )
        active_months = sum(1 for v in frame.features.values() if v.get("alerts", 0) > 0)
        profiles[info.code] = EntityProfile(
            info.id,
            info.code,
            window_features(frame, ctx),
            active_months,
            set(),
            cohort="24x7" if info.declared_24x7 else "business_hours",
        )
        # Random control candidates for the review pack, seeded per run and entity.
        closed_ids = frame.closed_alerts.id.to_numpy()
        rng = np.random.default_rng([run.id, info.id])
        controls[info.id] = [int(x) for x in rng.permutation(closed_ids)[:CONTROL_POOL]]
        del frame
        gc.collect()
        run.progress_json = {
            "done": i,
            "total": len(entities),
            "stage": "measuring",
            "entity": info.code,
        }
        db.commit()
        say(f"[{i}/{len(entities)}] measured {info.code}")

    # 2. Judge rule-based signals against their peer baselines.
    baselines: dict[str, dict[str, Any]] = {}
    written: list[_Written] = []
    for sig in signals:
        written += _judge_signal(db, run, sig, measured[sig.cfg.id], baselines)
    for w in written:
        profiles[w.code].flagged.add(w.signal_id)

    # 3. Population signals (anomaly model) see which rules already fired.
    run.progress_json = {**run.progress_json, "stage": "anomaly model"}
    for psig in population:
        try:
            pm = psig.measure_population(list(profiles.values()))
        except Exception as exc:
            errors.append(f"{psig.cfg.id}: {exc.__class__.__name__}: {exc}")
            logger.exception("Population signal %s failed", psig.cfg.id)
            continue
        names = {e.code: e.display_name for e in entities}
        rows = [_Measured(profiles[c].entity_id, c, names[c], m) for c, m in pm.items()]
        written += _judge_signal(db, run, psig, rows, baselines)

    # 4. Score, rank and build review packs.
    results = _score(db, run, cfg, entities, written, window[0])
    n_samples = _write_packs(db, run, cfg, results, written, controls)

    run.status = RunStatus.SUCCEEDED
    run.finished_at = datetime.now(UTC)
    run.progress_json = {
        "done": len(entities),
        "total": len(entities),
        "stage": "done",
        "findings": len(written),
        "entities": len(entities),
        "review_samples": n_samples,
        "seconds": round(time.perf_counter() - t0, 1),
        "errors": errors,
    }
    # Kept for the Negative Space and Peer Benchmark views: every entity's expected-vs-
    # observed coverage matrix (not only flagged ones) and its whole-window features.
    coverage = {r.code: r.measure.details.get("matrix", []) for r in measured.get("NS-02", [])}
    run.summary_json = _jsonable(
        {
            "baselines": baselines,
            "ranking": [{"code": r.code, "sai": r.sai, "rank": r.rank} for r in results],
            "coverage": coverage,
            "window_features": {
                c: {"cohort": p.cohort, "features": p.features} for c, p in profiles.items()
            },
        }
    )
    append_audit(
        db,
        actor=run.triggered_by or "system",
        action="run.complete",
        object_ref=f"run:{run.id}",
        payload={
            "findings": len(written),
            "review_samples": n_samples,
            "config_sha256": run.config_sha256,
            "data_sha256": run.data_sha256,
            "code_version": run.code_version,
        },
    )
    db.commit()
    say(
        f"Run {run.id}: {len(written)} findings, {n_samples} review samples across "
        f"{len(entities)} entities in {time.perf_counter() - t0:.0f}s"
    )


@dataclass
class _Written:
    finding_id: int
    entity_id: int
    code: str
    signal_id: str
    title: str
    capability: str
    severity: int
    confidence: float
    evidence: list[tuple[str, int, str]]  # reviewable evidence for sample packs


def _judge_signal(
    db: Session,
    run: AnalysisRun,
    sig: Signal,
    rows: list[_Measured],
    baselines: dict[str, dict[str, Any]],
) -> list[_Written]:
    peers: dict[str, float] = {}
    for r in rows:
        comparable = r.measure.comparable
        if comparable is not None and sig.evaluable(r.measure):
            peers[r.code] = float(comparable)
    base = baseline(peers, sig.cfg.min_scale)
    baselines[sig.cfg.id] = {
        "median": base.median,
        "scale": base.scale,
        "n": base.n,
        "values": {k: round(v, 5) for k, v in peers.items()},
    }
    out = []
    for r in rows:
        w = _write_finding(db, run, sig, r, base)
        if w is not None:
            out.append(w)
    return out


def _score(
    db: Session,
    run: AnalysisRun,
    cfg: AnalyticsConfig,
    entities: list[EntityInfo],
    written: list[_Written],
    period: date,
) -> list[EntityScoreResult]:
    by_entity: dict[int, list[ScoredFinding]] = {}
    for w in written:
        by_entity.setdefault(w.entity_id, []).append(
            ScoredFinding(
                w.finding_id, w.signal_id, w.title, w.capability, w.severity, w.confidence
            )
        )
    results = rank(
        [
            score_entity(e.id, e.code, e.display_name, by_entity.get(e.id, []), cfg.scoring)
            for e in entities
        ]
    )
    db.execute(
        insert(EntityScore),
        [
            {
                "run_id": run.id,
                "entity_id": r.entity_id,
                "period": period,
                "capability_scores_json": r.capabilities,
                "sai": r.sai,
                "rank": r.rank,
                "drivers_json": _jsonable(
                    {
                        "findings": len(r.findings),
                        "deficits": r.deficits,
                        "drivers": r.drivers(),
                        "summary": r.summary(len(results)),
                    }
                ),
            }
            for r in results
        ],
    )
    return results


def _write_packs(
    db: Session,
    run: AnalysisRun,
    cfg: AnalyticsConfig,
    results: list[EntityScoreResult],
    written: list[_Written],
    controls: dict[int, list[int]],
) -> int:
    evidence = {w.finding_id: w.evidence for w in written}
    rows = []
    for score in select_entities(results, cfg.review):
        for s in build_pack(score, evidence, controls.get(score.entity_id, []), cfg.review):
            rows.append(
                {
                    "run_id": run.id,
                    "entity_id": s.entity_id,
                    "record_type": s.record_type,
                    "record_id": s.record_id,
                    "stratum": s.stratum,
                    "reason": s.reason,
                }
            )
    if rows:
        db.execute(insert(ReviewSample), rows)
    return len(rows)


def _write_finding(
    db: Session, run: AnalysisRun, sig: Signal, r: _Measured, base: Baseline
) -> _Written | None:
    verdict = sig.judge(r.measure, base)
    if verdict is None:
        return None
    m = r.measure
    peer_median = sig.display(base.median) if base.n else None
    ctx = {
        **m.details,
        "entity": r.name,
        "value": m.value,
        "support": m.support,
        "peer_median": peer_median,
        "z": verdict.z,
        "percentile": verdict.percentile,
    }
    details = _jsonable(
        {**m.details, "peer_median": peer_median, "peer_n": base.n, "direction": sig.cfg.direction}
    )
    finding = Finding(
        run_id=run.id,
        entity_id=r.entity_id,
        period=None,
        signal_id=sig.cfg.id,
        signal_version=sig.cfg.version,
        family=sig.cfg.family,
        capability=sig.cfg.capability,
        severity=verdict.severity,
        confidence=verdict.confidence,
        metric_value=None if m.value is None else float(m.value),
        threshold=sig.cfg.peer_z_min,
        peer_percentile=verdict.percentile,
        title=sig.cfg.name,
        narrative=render(sig.cfg.narrative, ctx),
        details_json={**details, "z": verdict.z, "support": int(m.support)},
    )
    db.add(finding)
    db.flush()
    if m.evidence:
        db.execute(
            insert(FindingEvidence),
            [
                {
                    "finding_id": finding.id,
                    "record_type": e.record_type,
                    "record_id": e.record_id,
                    "note": (e.note or "")[:256],
                }
                for e in m.evidence
            ],
        )
    return _Written(
        finding.id,
        r.entity_id,
        r.code,
        sig.cfg.id,
        sig.cfg.name,
        sig.cfg.capability,
        verdict.severity,
        verdict.confidence,
        [(e.record_type, e.record_id, e.note or "") for e in m.evidence if e.record_id is not None],
    )


def _jsonable(obj: Any) -> Any:
    """Round-trip through JSON so numpy scalars and dates become plain JSON values."""

    def default(o: Any) -> Any:
        if isinstance(o, np.generic):
            return o.item()
        if isinstance(o, date | datetime):
            return o.isoformat()
        raise TypeError(f"Not JSON serialisable: {type(o).__name__}")

    return json.loads(json.dumps(obj, default=default))

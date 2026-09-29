"""Views behind the supervisory screens: coverage (negative space), peer benchmarks,
trends, and supervisor feedback on findings."""

from collections import defaultdict
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.config import load_config
from app.analytics.data import category_label
from app.analytics.features import FEATURES, PERCENT_FEATURES
from app.api.deps import get_current_user, require_roles
from app.api.scores import latest_run_id
from app.audit.chain import append_audit
from app.core.db import get_db
from app.models.analysis import (
    AnalysisRun,
    EntityPeriodFeature,
    EntityScore,
    Finding,
    SupervisorFeedback,
)
from app.models.entities import Entity
from app.models.enums import UserRole
from app.models.system import AppUser
from app.schemas.insights import (
    Benchmark,
    BenchmarkPoint,
    CoverageCell,
    CoverageOverview,
    CoverageRow,
    EntityCoverage,
    FeatureInfo,
    FeedbackIn,
    FeedbackOut,
    Trends,
    TrendSeries,
)

router = APIRouter(tags=["insights"], dependencies=[Depends(get_current_user)])
can_judge = require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.EXAMINER)

ASSET_ORDER = [
    "dc",
    "server",
    "db",
    "endpoint",
    "firewall",
    "email_gw",
    "cloud",
    "ot_scada",
    "ot_hmi",
]
DEFAULT_FEATURE = "median_close_h_high_crit"


def _run(db: Session, run_id: int | None) -> AnalysisRun | None:
    run_id = run_id or latest_run_id(db)
    if run_id is None:
        return None
    run = db.get(AnalysisRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


def _min_expected() -> float:
    return float(load_config().signal("NS-02").params["min_expected"])


def _feature_list() -> list[FeatureInfo]:
    return [FeatureInfo(key=k, label=v, percent=k in PERCENT_FEATURES) for k, v in FEATURES.items()]


def _check_feature(feature: str) -> None:
    if feature not in FEATURES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown feature '{feature}'")


def _asset_order(types: set[str]) -> list[str]:
    return [t for t in ASSET_ORDER if t in types] + sorted(types - set(ASSET_ORDER))


@router.get("/coverage", response_model=CoverageOverview)
def coverage_overview(run_id: int | None = None, db: Session = Depends(get_db)) -> CoverageOverview:
    run = _run(db, run_id)
    if run is None:
        return CoverageOverview(run_id=None, asset_types=[], rows=[])
    matrices: dict[str, list[dict[str, Any]]] = (run.summary_json or {}).get("coverage", {})
    threshold = _min_expected()
    scores = {
        e.code: (e, s)
        for s, e in db.execute(
            select(EntityScore, Entity)
            .join(Entity, Entity.id == EntityScore.entity_id)
            .where(EntityScore.run_id == run.id)
        )
    }
    types: set[str] = set()
    rows = []
    for code, cells in matrices.items():
        if code not in scores:
            continue
        entity, score = scores[code]
        expected: dict[str, float] = defaultdict(float)
        observed: dict[str, float] = defaultdict(float)
        holes = 0
        for c in cells:
            expected[c["asset_type"]] += c["expected"]
            observed[c["asset_type"]] += c["observed"]
            if c["expected"] >= threshold and c["observed"] == 0:
                holes += 1
        types |= set(expected)
        rows.append(
            CoverageRow(
                entity_code=code,
                entity_name=entity.display_name,
                sector=entity.sector,
                rank=score.rank,
                sai=score.sai,
                holes=holes,
                by_asset_type={
                    t: (round(observed[t] / expected[t], 3) if expected[t] else None)
                    for t in expected
                },
            )
        )
    rows.sort(key=lambda r: (-r.holes, r.rank))
    return CoverageOverview(run_id=run.id, asset_types=_asset_order(types), rows=rows)


@router.get("/coverage/{code}", response_model=EntityCoverage)
def entity_coverage(
    code: str, run_id: int | None = None, db: Session = Depends(get_db)
) -> EntityCoverage:
    run = _run(db, run_id)
    entity = db.scalar(select(Entity).where(Entity.code == code))
    if run is None or entity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No coverage for this entity")
    cells_raw = (run.summary_json or {}).get("coverage", {}).get(code)
    if cells_raw is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No coverage for this entity")
    threshold = _min_expected()
    cells = [
        CoverageCell(
            asset_type=c["asset_type"],
            category=c["category"],
            category_label=category_label(c["category"]),
            expected=c["expected"],
            observed=c["observed"],
            ratio=round(c["observed"] / c["expected"], 3) if c["expected"] > 0 else None,
            missing=c["expected"] >= threshold and c["observed"] == 0,
        )
        for c in cells_raw
    ]
    categories = sorted(
        {c.category for c in cells},
        key=lambda k: -sum(c.expected for c in cells if c.category == k),
    )
    return EntityCoverage(
        run_id=run.id,
        entity_code=code,
        entity_name=entity.display_name,
        min_expected=threshold,
        asset_types=_asset_order({c.asset_type for c in cells}),
        categories=categories,
        cells=cells,
    )


@router.get("/benchmarks", response_model=Benchmark)
def benchmarks(
    feature: str = DEFAULT_FEATURE, run_id: int | None = None, db: Session = Depends(get_db)
) -> Benchmark:
    _check_feature(feature)
    run = _run(db, run_id)
    base = Benchmark(
        run_id=None,
        feature=feature,
        label=FEATURES[feature],
        percent=feature in PERCENT_FEATURES,
        median=None,
        features=_feature_list(),
        points=[],
    )
    if run is None:
        return base
    wf: dict[str, dict[str, Any]] = (run.summary_json or {}).get("window_features", {})
    ranks = {
        code: rank
        for code, rank in db.execute(
            select(Entity.code, EntityScore.rank)
            .join(EntityScore, EntityScore.entity_id == Entity.id)
            .where(EntityScore.run_id == run.id)
        )
    }
    entities = {e.code: e for e in db.scalars(select(Entity).where(Entity.code.in_(wf)))}
    points = [
        BenchmarkPoint(
            entity_code=code,
            entity_name=entities[code].display_name,
            sector=entities[code].sector,
            cohort=v["cohort"],
            rank=ranks.get(code),
            value=float(v["features"].get(feature, 0.0)),
        )
        for code, v in wf.items()
        if code in entities
    ]
    points.sort(key=lambda p: -p.value)
    median = float(np.median([p.value for p in points])) if points else None
    return base.model_copy(update={"run_id": run.id, "median": median, "points": points})


@router.get("/trends", response_model=Trends)
def trends(
    feature: str = DEFAULT_FEATURE, run_id: int | None = None, db: Session = Depends(get_db)
) -> Trends:
    _check_feature(feature)
    run = _run(db, run_id)
    empty = Trends(
        run_id=None,
        feature=feature,
        label=FEATURES[feature],
        percent=feature in PERCENT_FEATURES,
        periods=[],
        median=[],
        series=[],
    )
    if run is None:
        return empty
    rows = db.execute(
        select(Entity.code, EntityPeriodFeature.period, EntityPeriodFeature.feature_json)
        .join(Entity, Entity.id == EntityPeriodFeature.entity_id)
        .where(EntityPeriodFeature.run_id == run.id)
    ).all()
    periods = sorted({p for _, p, _ in rows})
    idx = {p: i for i, p in enumerate(periods)}
    series: dict[str, list[float | None]] = defaultdict(lambda: [None] * len(periods))
    for code, period, feats in rows:
        # A month with no alerts has no meaningful operating metrics.
        if feats.get("alerts", 0) > 0:
            series[code][idx[period]] = float(feats.get(feature, 0.0))
    median: list[float | None] = []
    for i in range(len(periods)):
        vals = [v for s in series.values() if (v := s[i]) is not None]
        median.append(round(float(np.median(vals)), 5) if vals else None)
    return empty.model_copy(
        update={
            "run_id": run.id,
            "periods": periods,
            "median": median,
            "series": [TrendSeries(entity_code=c, values=v) for c, v in sorted(series.items())],
        }
    )


@router.get("/findings/{finding_id}/feedback", response_model=list[FeedbackOut])
def list_feedback(finding_id: int, db: Session = Depends(get_db)) -> list[FeedbackOut]:
    rows = db.execute(
        select(SupervisorFeedback, AppUser.username)
        .join(AppUser, AppUser.id == SupervisorFeedback.user_id)
        .where(SupervisorFeedback.finding_id == finding_id)
        .order_by(SupervisorFeedback.id.desc())
    ).all()
    return [
        FeedbackOut(id=f.id, verdict=f.verdict, comment=f.comment, user=u, created_at=f.created_at)
        for f, u in rows
    ]


@router.post(
    "/findings/{finding_id}/feedback",
    response_model=FeedbackOut,
    status_code=status.HTTP_201_CREATED,
)
def add_feedback(
    finding_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    user: AppUser = Depends(can_judge),
) -> FeedbackOut:
    finding = db.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")
    fb = SupervisorFeedback(
        finding_id=finding_id, user_id=user.id, verdict=body.verdict, comment=body.comment
    )
    db.add(fb)
    finding.status = body.verdict
    db.flush()
    append_audit(
        db,
        actor=user.username,
        action="finding.feedback",
        object_ref=f"finding:{finding_id}",
        payload={
            "verdict": body.verdict,
            "signal": finding.signal_id,
            "has_comment": bool(body.comment),
        },
    )
    db.commit()
    db.refresh(fb)
    return FeedbackOut(
        id=fb.id,
        verdict=fb.verdict,
        comment=fb.comment,
        user=user.username,
        created_at=fb.created_at,
    )

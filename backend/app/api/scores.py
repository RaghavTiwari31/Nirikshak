from collections import defaultdict
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.config import load_config
from app.api.analysis import finding_out
from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.analysis import AnalysisRun, EntityPeriodFeature, EntityScore, Finding
from app.models.entities import Entity
from app.models.enums import RunStatus
from app.schemas.analysis import FindingOut
from app.schemas.scoring import EntityProfileOut, MonthFeatures, ScoreOut, ScorePage

router = APIRouter(tags=["scores"], dependencies=[Depends(get_current_user)])


def latest_run_id(db: Session) -> int | None:
    return db.scalar(
        select(func.max(AnalysisRun.id)).where(AnalysisRun.status == RunStatus.SUCCEEDED)
    )


def _score_out(s: EntityScore, e: Entity) -> ScoreOut:
    d = s.drivers_json or {}
    return ScoreOut(
        rank=s.rank,
        entity_id=e.id,
        entity_code=e.code,
        entity_name=e.display_name,
        sector=e.sector,
        size_tier=e.size_tier,
        soc_model=e.soc_model,
        declared_24x7=e.declared_24x7,
        sai=s.sai,
        capabilities=s.capability_scores_json,
        findings=d.get("findings", 0),
        drivers=d.get("drivers", []),
        summary=d.get("summary", ""),
    )


def formula() -> dict[str, Any]:
    sc = load_config().scoring
    return {
        "finding_weight": "severity (1-4) x confidence (0-1)",
        "capability_score": f"100 * exp(-sum(weights in capability) / {sc.capability_k})",
        "sai": f"100 * (1 - exp(-sum(capability_weight * deficit) / {sc.sai_k}))",
        "capability_weights": sc.capability_weights,
    }


@router.get("/scores", response_model=ScorePage)
def scores(run_id: int | None = None, db: Session = Depends(get_db)) -> ScorePage:
    run_id = run_id or latest_run_id(db)
    if run_id is None:
        return ScorePage(
            run_id=None, window_start=None, window_end=None, formula=formula(), items=[]
        )
    run = db.get(AnalysisRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    rows = db.execute(
        select(EntityScore, Entity)
        .join(Entity, Entity.id == EntityScore.entity_id)
        .where(EntityScore.run_id == run_id)
        .order_by(EntityScore.rank)
    ).all()
    return ScorePage(
        run_id=run_id,
        window_start=run.params_json["window_start"],
        window_end=run.params_json["window_end"],
        formula=formula(),
        items=[_score_out(s, e) for s, e in rows],
    )


@router.get("/entities/{code}/profile", response_model=EntityProfileOut)
def entity_profile(
    code: str, run_id: int | None = None, db: Session = Depends(get_db)
) -> EntityProfileOut:
    entity = db.scalar(select(Entity).where(Entity.code == code))
    if entity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entity not found")
    run_id = run_id or latest_run_id(db)
    score_out: ScoreOut | None = None
    peer_caps: dict[str, float] = {}
    findings: list[FindingOut] = []
    monthly: list[MonthFeatures] = []
    peer_monthly: list[MonthFeatures] = []
    if run_id is not None:
        all_scores = db.scalars(select(EntityScore).where(EntityScore.run_id == run_id)).all()
        own = next((s for s in all_scores if s.entity_id == entity.id), None)
        if own is not None:
            score_out = _score_out(own, entity)
        caps: dict[str, list[float]] = defaultdict(list)
        for s in all_scores:
            for k, v in s.capability_scores_json.items():
                caps[k].append(v)
        peer_caps = {k: float(np.median(v)) for k, v in caps.items()}

        findings = [
            FindingOut(**finding_out(f, entity))
            for f in db.scalars(
                select(Finding)
                .where(Finding.run_id == run_id, Finding.entity_id == entity.id)
                .order_by(Finding.severity.desc(), Finding.confidence.desc())
            )
        ]

        by_month: dict[Any, list[dict[str, float]]] = defaultdict(list)
        for f in db.scalars(
            select(EntityPeriodFeature)
            .where(EntityPeriodFeature.run_id == run_id)
            .order_by(EntityPeriodFeature.period)
        ):
            by_month[f.period].append(f.feature_json)
            if f.entity_id == entity.id:
                monthly.append(MonthFeatures(period=f.period, features=f.feature_json))
        for period, rows in sorted(by_month.items()):
            keys = rows[0].keys()
            peer_monthly.append(
                MonthFeatures(
                    period=period,
                    features={
                        k: round(float(np.median([r.get(k, 0.0) for r in rows])), 5) for k in keys
                    },
                )
            )
    return EntityProfileOut(
        entity_id=entity.id,
        entity_code=entity.code,
        entity_name=entity.display_name,
        sector=entity.sector,
        size_tier=entity.size_tier,
        soc_model=entity.soc_model,
        declared_24x7=entity.declared_24x7,
        declared_mttr_hours=entity.declared_mttr_hours,
        declared_coverage_pct=entity.declared_coverage_pct,
        run_id=run_id,
        score=score_out,
        peer_capability_median=peer_caps,
        findings=findings,
        monthly=monthly,
        peer_monthly=peer_monthly,
    )

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.validation import field_validation, summary
from app.api.deps import get_current_user
from app.api.scores import latest_run_id
from app.core.db import get_db
from app.models.analysis import ValidationStudy
from app.schemas.validation import FieldValidation, RobustnessRow, ValidationSummary

router = APIRouter(
    prefix="/validation", tags=["validation"], dependencies=[Depends(get_current_user)]
)


def _run_id(db: Session, run_id: int | None) -> int:
    run_id = run_id or latest_run_id(db)
    if run_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No completed analysis run")
    return run_id


@router.get("/summary", response_model=ValidationSummary)
def validation_summary(
    run_id: int | None = None, db: Session = Depends(get_db)
) -> ValidationSummary:
    data = summary(db, _run_id(db, run_id))
    if data is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No planted ground truth: validation needs a synthetic dataset",
        )
    data["yield_curves"] = data.pop("yield")
    return ValidationSummary.model_validate(data)


@router.get("/robustness", response_model=list[RobustnessRow])
def robustness(db: Session = Depends(get_db)) -> list[RobustnessRow]:
    rows = []
    for s in db.scalars(select(ValidationStudy).order_by(ValidationStudy.id.desc()).limit(50)):
        r = s.results_json
        e = r.get("evaluation", {})
        effort = (r.get("yield") or {}).get("effort_to_target") or {}
        holdout = r.get("holdout", [])
        rows.append(
            RobustnessRow(
                id=s.id,
                batch=s.batch,
                created_at=s.created_at,
                seed=s.seed,
                intensity_scale=s.intensity_scale,
                config_sha256=s.config_sha256,
                weak_caught=e.get("weak_caught", 0),
                weak_entities=e.get("weak_entities", 0),
                healthy_flagged=len(e.get("healthy_flagged", [])),
                healthy_entities=e.get("healthy_entities", 0),
                macro_precision=e.get("macro_precision"),
                macro_recall=e.get("macro_recall"),
                ndcg_at_10=e.get("ndcg_at_10"),
                precision_at_10=e.get("precision_at_10"),
                effort_tool=effort.get("tool"),
                effort_random=effort.get("random"),
                holdout_found=sum(1 for h in holdout if h.get("found")),
                holdout_total=len(holdout),
            )
        )
    return rows


@router.get("/field", response_model=FieldValidation)
def field(run_id: int | None = None, db: Session = Depends(get_db)) -> FieldValidation:
    return FieldValidation.model_validate(field_validation(db, _run_id(db, run_id)))

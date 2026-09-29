from datetime import datetime

from pydantic import BaseModel


class SignalValidation(BaseModel):
    signal_id: str
    planted: int
    flagged: int
    true_pos: int
    precision: float | None
    recall: float | None
    false_pos: list[str]
    missed: list[str]


class EvaluationBlock(BaseModel):
    signals: list[SignalValidation]
    weak_entities: int
    weak_caught: int
    healthy_entities: int
    healthy_flagged: list[str]
    ndcg_at_10: float | None
    precision_at_10: float | None
    macro_precision: float | None
    macro_recall: float | None


class EffortToTarget(BaseModel):
    target: float
    tool: int | None
    oracle: int | None
    random: int | None


class YieldCurves(BaseModel):
    k: list[int]
    tool: list[float]
    oracle: list[float]
    random_mean: list[float]
    random_p05: list[float]
    random_p95: list[float]
    effort_to_target: EffortToTarget | None = None
    n_entities: int = 0
    n_weak: int = 0


class ArchetypeResult(BaseModel):
    key: str
    label: str
    description: str
    severity: int
    planted_signals: list[str]
    entities: int
    caught: int | None
    flagged: int
    mean_rank: float | None


class HoldoutResult(BaseModel):
    entity_code: str
    entity_name: str
    rank: int | None
    found: bool
    flagged_signals: list[str]
    narrative: str | None


class ValidationSummary(BaseModel):
    run_id: int
    evaluation: EvaluationBlock
    yield_curves: YieldCurves
    archetypes: list[ArchetypeResult]
    holdout: list[HoldoutResult]


class RobustnessRow(BaseModel):
    id: int
    batch: str
    created_at: datetime
    seed: int
    intensity_scale: float
    config_sha256: str
    weak_caught: int
    weak_entities: int
    healthy_flagged: int
    healthy_entities: int
    macro_precision: float | None
    macro_recall: float | None
    ndcg_at_10: float | None
    precision_at_10: float | None
    effort_tool: int | None
    effort_random: int | None
    holdout_found: int
    holdout_total: int


class FeedbackSignal(BaseModel):
    signal_id: str
    accepted: int
    rejected: int
    needs_info: int
    precision: float | None


class ReviewStratum(BaseModel):
    total: int
    reviewed: int
    confirmed: int
    hit_rate: float | None


class FieldValidation(BaseModel):
    run_id: int
    feedback: list[FeedbackSignal]
    review: dict[str, ReviewStratum]

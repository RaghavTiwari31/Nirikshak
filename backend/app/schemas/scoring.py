from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.schemas.analysis import FindingOut


class Driver(BaseModel):
    finding_id: int
    signal_id: str
    title: str
    capability: str
    weight: float


class ScoreOut(BaseModel):
    rank: int
    entity_id: int
    entity_code: str
    entity_name: str
    sector: str
    size_tier: str
    soc_model: str
    declared_24x7: bool
    sai: float
    capabilities: dict[str, float]
    findings: int
    drivers: list[Driver]
    summary: str


class ScorePage(BaseModel):
    run_id: int | None
    window_start: date | None
    window_end: date | None
    formula: dict[str, Any]
    items: list[ScoreOut]


class MonthFeatures(BaseModel):
    period: date
    features: dict[str, float]


class EntityProfileOut(BaseModel):
    entity_id: int
    entity_code: str
    entity_name: str
    sector: str
    size_tier: str
    soc_model: str
    declared_24x7: bool
    declared_mttr_hours: float | None
    declared_coverage_pct: float | None
    run_id: int | None
    score: ScoreOut | None
    peer_capability_median: dict[str, float]
    findings: list[FindingOut]
    monthly: list[MonthFeatures]
    peer_monthly: list[MonthFeatures]


Outcome = Literal["issue_confirmed", "no_issue", "needs_info"]


class SampleOut(BaseModel):
    id: int
    record_type: str
    record_id: int
    stratum: str
    reason: str | None
    reviewed_at: datetime | None
    reviewer: str | None
    outcome: str | None
    record: dict[str, Any] | None


class PackSummary(BaseModel):
    entity_code: str
    entity_name: str
    rank: int
    sai: float
    samples: int
    directed: int
    control: int
    reviewed: int
    confirmed_directed: int
    confirmed_control: int


class PackDetail(PackSummary):
    run_id: int
    items: list[SampleOut]


class SampleUpdate(BaseModel):
    outcome: Outcome

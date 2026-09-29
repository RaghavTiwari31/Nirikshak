from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


class SignalOut(BaseModel):
    id: str
    version: str
    name: str
    family: str
    capability: str
    severity: int
    direction: str
    peer_z_min: float | None
    min_support: int
    min_scale: float | None
    params: dict[str, Any]
    description: str
    rationale: str


class SignalLibrary(BaseModel):
    config_version: str
    config_sha256: str
    signals: list[SignalOut]


class RunCreate(BaseModel):
    window_start: date | None = None
    window_end: date | None = None


class RunOut(BaseModel):
    id: int
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    triggered_by: str | None
    code_version: str
    config_sha256: str
    data_sha256: str | None
    window_start: date
    window_end: date
    progress: dict[str, Any]
    error: str | None
    findings: int


class RunDetail(RunOut):
    findings_by_signal: dict[str, int]
    entities_flagged: int


class SignalScoreOut(BaseModel):
    signal_id: str
    planted: int
    flagged: int
    true_pos: int
    precision: float | None
    recall: float | None
    false_pos: list[str]
    missed: list[str]


class EvaluationOut(BaseModel):
    run_id: int
    signals: list[SignalScoreOut]
    healthy_entities: int
    healthy_flagged: list[str]
    weak_entities: int
    weak_caught: int
    ndcg_at_10: float | None = None
    precision_at_10: float | None = None


class FindingOut(BaseModel):
    id: int
    run_id: int
    entity_id: int
    entity_code: str
    entity_name: str
    signal_id: str
    family: str
    capability: str
    severity: int
    confidence: float
    metric_value: float | None
    peer_percentile: float | None
    title: str
    narrative: str
    status: str


class FindingPage(BaseModel):
    items: list[FindingOut]
    total: int
    run_id: int | None


class PeerPoint(BaseModel):
    entity_code: str
    value: float


class FindingDetail(FindingOut):
    signal_version: str
    details: dict[str, Any]
    peers: list[PeerPoint]
    peer_median: float | None
    evidence_count: int


class EvidenceRow(BaseModel):
    id: int
    record_type: str
    record_id: int | None
    note: str | None
    record: dict[str, Any] | None


class EvidencePage(BaseModel):
    items: list[EvidenceRow]
    total: int


class AuditRow(BaseModel):
    id: int
    ts: datetime
    actor: str
    action: str
    object_ref: str | None
    payload: dict[str, Any]
    hash: str


class AuditPage(BaseModel):
    items: list[AuditRow]
    total: int

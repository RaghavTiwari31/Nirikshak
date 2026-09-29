from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractField(BaseModel):
    name: str
    kind: str
    required: bool
    description: str
    enum: list[str] | None
    pseudonymized: bool


class ContractDataset(BaseModel):
    key: str
    label: str
    description: str
    per_entity: bool
    fields: list[ContractField]


class PreviewOut(BaseModel):
    filename: str
    dataset: str
    source_format: str
    sha256: str
    row_count: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    suggested_mapping: dict[str, str]
    unmapped_required: list[str]


class SubmissionSummary(BaseModel):
    id: int
    entity_code: str
    entity_name: str
    period_start: date
    period_end: date
    received_at: datetime
    source_format: str
    status: str
    row_counts: dict[str, int]
    errors: int
    warnings: int


class SubmissionDetail(SubmissionSummary):
    file_sha256: str | None
    dq_report: dict[str, Any]


class SubmissionPage(BaseModel):
    items: list[SubmissionSummary]
    total: int


class UploadResult(BaseModel):
    kind: Literal["submission", "entity_profile"]
    submission: SubmissionDetail | None = None
    entity_codes: list[str] = []
    profile_report: dict[str, Any] | None = None


class JsonSubmission(BaseModel):
    """Machine-to-machine submission (the PS's 'APIs where available')."""

    entity_code: str = Field(max_length=32)
    period_start: date
    period_end: date
    timezone: str = "Asia/Kolkata"
    datasets: dict[str, list[dict[str, Any]]]


class MappingIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    dataset: str
    entity_code: str | None = None
    source_format: str = "csv"
    mapping: dict[str, str]


class MappingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    dataset: str
    entity_id: int | None
    source_format: str
    mapping_json: dict[str, str]
    created_at: datetime


class EntityOut(BaseModel):
    id: int
    code: str
    display_name: str
    sector: str
    size_tier: str
    soc_model: str
    declared_24x7: bool
    submissions: int
    last_period_end: date | None

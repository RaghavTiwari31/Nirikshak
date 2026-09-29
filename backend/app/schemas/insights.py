from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class CoverageCell(BaseModel):
    asset_type: str
    category: str
    category_label: str
    expected: float
    observed: int
    ratio: float | None  # observed / expected; None when nothing is expected
    missing: bool  # tested (expected >= threshold) and nothing observed


class EntityCoverage(BaseModel):
    run_id: int
    entity_code: str
    entity_name: str
    min_expected: float
    asset_types: list[str]
    categories: list[str]
    cells: list[CoverageCell]


class CoverageRow(BaseModel):
    entity_code: str
    entity_name: str
    sector: str
    rank: int
    sai: float
    holes: int
    by_asset_type: dict[str, float | None]  # observed / expected per asset type


class CoverageOverview(BaseModel):
    run_id: int | None
    asset_types: list[str]
    rows: list[CoverageRow]


class FeatureInfo(BaseModel):
    key: str
    label: str
    percent: bool


class BenchmarkPoint(BaseModel):
    entity_code: str
    entity_name: str
    sector: str
    cohort: str
    rank: int | None
    value: float


class Benchmark(BaseModel):
    run_id: int | None
    feature: str
    label: str
    percent: bool
    median: float | None
    features: list[FeatureInfo]
    points: list[BenchmarkPoint]


class TrendSeries(BaseModel):
    entity_code: str
    values: list[float | None]


class Trends(BaseModel):
    run_id: int | None
    feature: str
    label: str
    percent: bool
    periods: list[date]
    median: list[float | None]
    series: list[TrendSeries]


class FeedbackIn(BaseModel):
    verdict: Literal["accepted", "rejected", "needs_info"]
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackOut(BaseModel):
    id: int
    verdict: str
    comment: str | None
    user: str
    created_at: datetime

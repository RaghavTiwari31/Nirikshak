"""Loads config/signals.yaml: thresholds, severities and narratives for every signal."""

import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "signals.yaml"


class SignalConfig(BaseModel):
    id: str
    version: str
    name: str
    family: Literal["execution_gap", "negative_space", "anomaly", "trend"]
    capability: str
    severity: int = Field(ge=1, le=4)
    direction: Literal["high", "low"]
    peer_z_min: float | None
    min_support: int = Field(ge=1)
    # Floor for the peer spread, so near-identical peers cannot turn a tiny difference
    # into a large z-score.
    min_scale: float | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    description: str
    rationale: str
    narrative: str


class ScoringConfig(BaseModel):
    capability_k: float = Field(gt=0)
    sai_k: float = Field(gt=0)
    capability_weights: dict[str, float]


class ReviewConfig(BaseModel):
    top_entities: int = Field(ge=0)
    min_sai: float
    pack_size: int = Field(ge=1)
    control_share: float = Field(ge=0, le=1)


class AnomalyConfig(BaseModel):
    # feature name -> rule signals that already explain an extreme value of it
    features: dict[str, list[str]]


class AnalyticsConfig(BaseModel):
    version: str
    timezone: str
    default_sla_hours: dict[str, float]
    scoring: ScoringConfig
    review: ReviewConfig
    anomaly: AnomalyConfig
    signals: list[SignalConfig]
    sha256: str = ""

    def signal(self, signal_id: str) -> SignalConfig:
        return next(s for s in self.signals if s.id == signal_id)


@lru_cache
def load_config(path: Path = CONFIG_PATH) -> AnalyticsConfig:
    raw = path.read_bytes()
    cfg = AnalyticsConfig.model_validate(yaml.safe_load(raw))
    ids = [s.id for s in cfg.signals]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate signal ids in signals.yaml")
    cfg.sha256 = hashlib.sha256(raw).hexdigest()
    return cfg

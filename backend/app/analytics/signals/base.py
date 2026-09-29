"""Signal framework.

A signal has two steps:
  measure(frame)  -> Measure   metric + absolute-rule verdict + evidence, per entity
  judge(...)      -> Verdict   combines the absolute rule with the peer comparison
Measurement happens entity by entity; judging happens once every entity has been measured,
so each entity is compared with the full peer distribution.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

import pandas as pd

from app.analytics.config import SignalConfig
from app.analytics.data import EntityFrame, RunContext
from app.analytics.stats import Baseline

MAX_EVIDENCE = 50


@dataclass
class Evidence:
    record_type: str  # alert | case | asset | aggregate
    record_id: int | None
    note: str | None = None


@dataclass
class Measure:
    value: float | None  # None = not applicable to this entity
    support: int  # how many records the metric is based on
    triggered: bool  # absolute rule met
    details: dict[str, Any] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    peer_value: float | None = None  # value used for peer comparison, if transformed
    strength: float = 1.0  # 0..1, used for confidence when there is no peer test

    @property
    def comparable(self) -> float | None:
        return self.peer_value if self.peer_value is not None else self.value


@dataclass
class Verdict:
    confidence: float
    severity: int
    z: float | None
    percentile: float | None


class Signal(ABC):
    id: ClassVar[str]

    def __init__(self, cfg: SignalConfig, ctx: RunContext) -> None:
        self.cfg = cfg
        self.ctx = ctx

    @property
    def p(self) -> dict[str, Any]:
        return self.cfg.params

    @abstractmethod
    def measure(self, f: EntityFrame) -> Measure: ...

    def display(self, comparable: float) -> float:
        """Convert a peer-comparison value back to the metric's own units."""
        return comparable

    def evaluable(self, m: Measure) -> bool:
        return m.comparable is not None and m.support >= self.cfg.min_support

    def judge(self, m: Measure, base: Baseline) -> Verdict | None:
        if not self.evaluable(m) or not m.triggered:
            return None
        assert m.comparable is not None
        z: float | None = None
        pct: float | None = None
        if base.n:
            z = base.z(m.comparable)
            if self.cfg.direction == "low":
                z = -z
            pct = base.percentile(m.comparable)
        if self.cfg.peer_z_min is not None:
            if z is None or z < self.cfg.peer_z_min:
                return None
            # Confidence grows with how far past the peer threshold the entity is,
            # and with how much evidence the metric rests on.
            excess = min(1.0, (z - self.cfg.peer_z_min) / 4)
            support = min(1.0, m.support / (4 * self.cfg.min_support))
            confidence = 0.5 + 0.3 * excess + 0.2 * support
            severity = self.cfg.severity + (1 if z >= 2 * self.cfg.peer_z_min else 0)
        else:
            confidence = 0.6 + 0.35 * max(0.0, min(1.0, m.strength))
            severity = self.cfg.severity
        return Verdict(round(min(confidence, 0.97), 3), min(severity, 4), z, pct)


@dataclass
class EntityProfile:
    """What a population signal knows about one entity after the per-entity pass."""

    entity_id: int
    code: str
    features: dict[str, float]  # whole-window feature vector
    months: int  # months with evidence
    flagged: set[str]  # rule signals already raised for this entity
    cohort: str = "all"  # entities are standardised against peers in the same cohort


class PopulationSignal(Signal):
    """A signal that needs every entity at once (e.g. an anomaly model fitted on peers)."""

    def measure(self, f: EntityFrame) -> Measure:
        raise NotImplementedError("Population signals are measured with measure_population")

    @abstractmethod
    def measure_population(self, profiles: list[EntityProfile]) -> dict[str, Measure]: ...


def ids(
    df: pd.DataFrame, record_type: str, note: str | None = None, limit: int = MAX_EVIDENCE
) -> list[Evidence]:
    return [Evidence(record_type, int(i), note) for i in df["id"].head(limit)]


REGISTRY: dict[str, type[Signal]] = {}


def register(cls: type[Signal]) -> type[Signal]:
    REGISTRY[cls.id] = cls
    return cls

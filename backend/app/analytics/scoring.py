"""Capability scores and the Supervisory Attention Index (SAI).

The formulas are deliberately simple and published in signals.yaml, so a supervisor can
recompute any score by hand from the findings behind it:
    w   = severity x confidence                                   (per finding)
    S_c = 100 * exp(-sum(w in capability c) / capability_k)         (0-100, higher = healthier)
    SAI = 100 * (1 - exp(-sum_c(weight_c * sum(w in c)) / sai_k))   (0-100, higher = look first)
"""

import math
from dataclasses import dataclass, field
from typing import Any

from app.analytics.config import ScoringConfig
from app.models.enums import Capability

CAPABILITIES = [c.value for c in Capability]
CAPABILITY_LABEL = {
    "threat_detection": "threat detection",
    "investigation": "investigation",
    "escalation": "escalation",
    "incident_response": "incident response",
    "security_operations": "security operations",
    "governance": "governance & oversight",
    "operational_discipline": "operational discipline",
    "cyber_resilience": "cyber resilience",
}


@dataclass
class ScoredFinding:
    finding_id: int
    signal_id: str
    title: str
    capability: str
    severity: int
    confidence: float

    @property
    def weight(self) -> float:
        return self.severity * self.confidence


@dataclass
class EntityScoreResult:
    entity_id: int
    code: str
    name: str
    capabilities: dict[str, float]
    deficits: dict[str, float]
    sai: float
    rank: int = 0
    findings: list[ScoredFinding] = field(default_factory=list)

    def drivers(self, top: int = 5) -> list[dict[str, Any]]:
        ranked = sorted(self.findings, key=lambda f: -f.weight)[:top]
        return [
            {
                "finding_id": f.finding_id,
                "signal_id": f.signal_id,
                "title": f.title,
                "capability": f.capability,
                "weight": round(f.weight, 3),
            }
            for f in ranked
        ]

    def summary(self, n_entities: int) -> str:
        if not self.findings:
            return (
                f"{self.name} is #{self.rank} of {n_entities} for attention, with nothing "
                f"found that needs a supervisor's review in this period."
            )
        weakest = sorted((v, k) for k, v in self.capabilities.items() if v < 100)[:2]
        caps = ", ".join(f"{CAPABILITY_LABEL[k]} ({v:.0f}/100)" for v, k in weakest)
        top = "; ".join(d["title"] for d in self.drivers(3))  # titles keep acronyms (OT, SLA)
        return (
            f"{self.name} is #{self.rank} of {n_entities} for attention (score "
            f"{self.sai:.0f} out of 100). Weakest areas: {caps}. Biggest reasons: {top}."
        )


def score_entity(
    entity_id: int, code: str, name: str, findings: list[ScoredFinding], cfg: ScoringConfig
) -> EntityScoreResult:
    deficits = dict.fromkeys(CAPABILITIES, 0.0)
    for f in findings:
        deficits[f.capability] = deficits.get(f.capability, 0.0) + f.weight
    capabilities = {c: round(100 * math.exp(-d / cfg.capability_k), 1) for c, d in deficits.items()}
    weighted = sum(cfg.capability_weights.get(c, 1.0) * d for c, d in deficits.items())
    sai = round(100 * (1 - math.exp(-weighted / cfg.sai_k)), 1)
    return EntityScoreResult(
        entity_id,
        code,
        name,
        capabilities,
        {c: round(d, 3) for c, d in deficits.items()},
        sai,
        findings=findings,
    )


def rank(results: list[EntityScoreResult]) -> list[EntityScoreResult]:
    """Highest SAI first; ties broken by number of findings, then code (deterministic)."""
    ordered = sorted(results, key=lambda r: (-r.sai, -len(r.findings), r.code))
    for i, r in enumerate(ordered, start=1):
        r.rank = i
    return ordered

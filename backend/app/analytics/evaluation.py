"""Score a run's findings against the generator's planted ground truth.

This is the core of the Validation Lab (Phase 5): for every signal, which entities had the
weakness planted and which did the tool flag?
"""

import math
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.config import load_config
from app.models.analysis import EntityScore, Finding, SyntheticTruth
from app.models.entities import Entity


@dataclass
class SignalScore:
    signal_id: str
    planted: int
    flagged: int
    true_pos: int
    false_pos: list[str] = field(default_factory=list)  # entity codes
    missed: list[str] = field(default_factory=list)

    @property
    def precision(self) -> float | None:
        return self.true_pos / self.flagged if self.flagged else None

    @property
    def recall(self) -> float | None:
        return self.true_pos / self.planted if self.planted else None


@dataclass
class Evaluation:
    run_id: int
    signals: list[SignalScore]
    healthy_entities: int
    healthy_flagged: list[str]
    weak_entities: int
    weak_caught: int  # weakened entities with at least one correct finding
    # Ranking quality vs the "expert" ranking implied by planted severity (None if unscored).
    ndcg_at_10: float | None = None
    precision_at_10: float | None = None

    @property
    def healthy_flag_rate(self) -> float:
        return len(self.healthy_flagged) / self.healthy_entities if self.healthy_entities else 0


def ndcg(ranked_gains: list[float], k: int) -> float:
    """Normalised discounted cumulative gain of the first k items."""

    def dcg(gains: list[float]) -> float:
        return sum((2**g - 1) / math.log2(i + 2) for i, g in enumerate(gains[:k]))

    ideal = dcg(sorted(ranked_gains, reverse=True))
    return dcg(ranked_gains) / ideal if ideal else 0.0


def evaluate(db: Session, run_id: int) -> Evaluation | None:
    truth = {
        code: (t.archetype, set(t.planted_signals))
        for t, code in db.execute(
            select(SyntheticTruth, Entity.code).join(Entity, Entity.id == SyntheticTruth.entity_id)
        )
    }
    if not truth:
        return None
    flagged: dict[str, set[str]] = {}
    for sig, code in db.execute(
        select(Finding.signal_id, Entity.code)
        .join(Entity, Entity.id == Finding.entity_id)
        .where(Finding.run_id == run_id)
    ):
        flagged.setdefault(sig, set()).add(code)

    scores = []
    for s in load_config().signals:
        planted = {c for c, (_a, sigs) in truth.items() if s.id in sigs}
        hits = flagged.get(s.id, set()) & set(truth)
        scores.append(
            SignalScore(
                signal_id=s.id,
                planted=len(planted),
                flagged=len(hits),
                true_pos=len(hits & planted),
                false_pos=sorted(hits - planted),
                missed=sorted(planted - hits),
            )
        )

    healthy = [c for c, (a, _s) in truth.items() if a == "healthy"]
    any_flag = set().union(*flagged.values()) if flagged else set()
    weak = [c for c, (a, _s) in truth.items() if a != "healthy"]
    caught = [c for c in weak if any(c in flagged.get(sig, set()) for sig in truth[c][1])]
    ev = Evaluation(
        run_id, scores, len(healthy), sorted(set(healthy) & any_flag), len(weak), len(caught)
    )

    severity = {
        code: sev
        for sev, code in db.execute(
            select(SyntheticTruth.severity, Entity.code).join(
                Entity, Entity.id == SyntheticTruth.entity_id
            )
        )
    }
    ranked = [
        code
        for (code,) in db.execute(
            select(Entity.code)
            .join(EntityScore, EntityScore.entity_id == Entity.id)
            .where(EntityScore.run_id == run_id)
            .order_by(EntityScore.rank)
        )
    ]
    if ranked:
        gains = [float(severity.get(c, 0)) for c in ranked]
        ev.ndcg_at_10 = round(ndcg(gains, 10), 3)
        ev.precision_at_10 = sum(1 for g in gains[:10] if g > 0) / min(10, len(gains))
    return ev

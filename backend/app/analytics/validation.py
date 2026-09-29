"""The Validation Lab: how well does SAT-SA do the job supervisors do by hand today?

Three kinds of evidence, answering the problem statement's validation requirement (§8):
  1. Planted truth - the synthetic generator records which weaknesses it planted where, so
     precision/recall per signal and the quality of the attention ranking are measurable.
  2. Detection yield - if an examiner works through entities in SAT-SA's order, how many
     weakened entities have they found after k entities, compared with today's approach
     (entities examined in no informed order: a random order, simulated)?
  3. Field validation - once supervisors use the tool, their verdicts on findings and their
     review-pack outcomes (directed vs random control) measure real-world precision.
"""

from collections import Counter, defaultdict
from dataclasses import asdict
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.evaluation import evaluate
from app.models.analysis import (
    EntityScore,
    Finding,
    ReviewSample,
    SupervisorFeedback,
    SyntheticTruth,
)
from app.models.entities import Entity
from app.synth.archetypes import ARCHETYPES

N_SIMULATIONS = 2000
TARGET = 0.8  # "find 80% of weakened entities"


def yield_curves(
    ranked: list[str], weak: set[str], n_sims: int = N_SIMULATIONS, seed: int = 0
) -> dict[str, Any]:
    """Share of weakened entities found after examining the first k entities (k = 0..n)."""
    n, w = len(ranked), len(weak & set(ranked))
    if n == 0 or w == 0:
        return {
            "k": [],
            "tool": [],
            "oracle": [],
            "random_mean": [],
            "random_p05": [],
            "random_p95": [],
            "effort_to_target": {},
        }
    hits = np.array([1 if code in weak else 0 for code in ranked])
    tool = np.concatenate([[0], np.cumsum(hits)]) / w
    oracle = np.minimum(np.arange(n + 1), w) / w
    rng = np.random.default_rng(seed)
    sims = np.array(
        [np.concatenate([[0], np.cumsum(rng.permutation(hits))]) / w for _ in range(n_sims)]
    )
    mean = sims.mean(axis=0)

    def effort(curve: np.ndarray) -> int | None:
        reached = np.nonzero(curve >= TARGET - 1e-9)[0]
        return int(reached[0]) if len(reached) else None

    return {
        "k": list(range(n + 1)),
        "tool": np.round(tool, 4).tolist(),
        "oracle": np.round(oracle, 4).tolist(),
        "random_mean": np.round(mean, 4).tolist(),
        "random_p05": np.round(np.percentile(sims, 5, axis=0), 4).tolist(),
        "random_p95": np.round(np.percentile(sims, 95, axis=0), 4).tolist(),
        "effort_to_target": {
            "target": TARGET,
            "tool": effort(tool),
            "oracle": effort(oracle),
            "random": effort(mean),
        },
        "n_entities": n,
        "n_weak": w,
    }


def summary(db: Session, run_id: int) -> dict[str, Any] | None:
    ev = evaluate(db, run_id)
    if ev is None:
        return None
    truth = {
        code: t
        for t, code in db.execute(
            select(SyntheticTruth, Entity.code).join(Entity, Entity.id == SyntheticTruth.entity_id)
        )
    }
    ranked_rows = db.execute(
        select(Entity.code, Entity.display_name, EntityScore.rank, EntityScore.sai)
        .join(EntityScore, EntityScore.entity_id == Entity.id)
        .where(EntityScore.run_id == run_id)
        .order_by(EntityScore.rank)
    ).all()
    ranked = [r[0] for r in ranked_rows]
    rank_of = {r[0]: (r[2], r[3], r[1]) for r in ranked_rows}
    weak = {c for c, t in truth.items() if t.archetype != "healthy"}

    flagged: dict[str, set[str]] = defaultdict(set)
    an01: dict[str, str] = {}
    for sig, code, narrative in db.execute(
        select(Finding.signal_id, Entity.code, Finding.narrative)
        .join(Entity, Entity.id == Finding.entity_id)
        .where(Finding.run_id == run_id)
    ):
        flagged[code].add(sig)
        if sig == "AN-01":
            an01[code] = narrative

    archetypes = []
    by_arch: dict[str, list[str]] = defaultdict(list)
    for code, t in truth.items():
        by_arch[t.archetype].append(code)
    for key, codes in sorted(by_arch.items(), key=lambda kv: -ARCHETYPES[kv[0]].severity):
        arch = ARCHETYPES[key]
        planted = set(arch.planted_signals)
        caught = [c for c in codes if flagged[c] & set(truth[c].planted_signals)]
        any_flag = [c for c in codes if flagged[c]]
        ranks = [rank_of[c][0] for c in codes if c in rank_of]
        archetypes.append(
            {
                "key": key,
                "label": arch.label,
                "description": arch.description,
                "severity": arch.severity,
                "planted_signals": sorted(planted),
                "entities": len(codes),
                "caught": len(caught) if key != "healthy" else None,
                "flagged": len(any_flag),
                "mean_rank": round(float(np.mean(ranks)), 1) if ranks else None,
            }
        )

    holdout = [
        {
            "entity_code": c,
            "entity_name": rank_of.get(c, (0, 0, c))[2],
            "rank": rank_of.get(c, (None,))[0],
            "found": "AN-01" in flagged[c],
            "flagged_signals": sorted(flagged[c]),
            "narrative": an01.get(c),
        }
        for c in sorted(by_arch.get("holdout_unknown", []))
    ]
    scores = [asdict(s) | {"precision": s.precision, "recall": s.recall} for s in ev.signals]
    return {
        "run_id": run_id,
        "evaluation": {
            "signals": scores,
            "weak_entities": ev.weak_entities,
            "weak_caught": ev.weak_caught,
            "healthy_entities": ev.healthy_entities,
            "healthy_flagged": ev.healthy_flagged,
            "ndcg_at_10": ev.ndcg_at_10,
            "precision_at_10": ev.precision_at_10,
            **macro(ev.signals),
        },
        "yield": yield_curves(ranked, weak),
        "archetypes": archetypes,
        "holdout": holdout,
    }


def macro(signals: list[Any]) -> dict[str, float | None]:
    """Mean precision / recall over signals that have planted truth (unweighted)."""
    planted = [s for s in signals if s.planted]
    precisions = [s.precision for s in planted if s.precision is not None]
    recalls = [s.recall for s in planted if s.recall is not None]
    return {
        "macro_precision": round(float(np.mean(precisions)), 3) if precisions else None,
        "macro_recall": round(float(np.mean(recalls)), 3) if recalls else None,
    }


def field_validation(db: Session, run_id: int) -> dict[str, Any]:
    """Real-world evidence: supervisor verdicts on findings, and review-pack outcomes."""
    verdicts: dict[str, Counter[str]] = defaultdict(Counter)
    for sig, verdict in db.execute(
        select(Finding.signal_id, SupervisorFeedback.verdict)
        .join(SupervisorFeedback, SupervisorFeedback.finding_id == Finding.id)
        .where(Finding.run_id == run_id)
    ):
        verdicts[sig][verdict] += 1
    per_signal = []
    for sig, c in sorted(verdicts.items()):
        judged = c["accepted"] + c["rejected"]
        per_signal.append(
            {
                "signal_id": sig,
                "accepted": c["accepted"],
                "rejected": c["rejected"],
                "needs_info": c["needs_info"],
                "precision": round(c["accepted"] / judged, 3) if judged else None,
            }
        )
    strata: dict[str, Counter[str]] = {"directed": Counter(), "control": Counter()}
    for stratum, outcome in db.execute(
        select(ReviewSample.stratum, ReviewSample.outcome).where(ReviewSample.run_id == run_id)
    ):
        group = strata["control" if stratum == "random_control" else "directed"]
        group["total"] += 1
        if outcome:
            group["reviewed"] += 1
            group[outcome] += 1

    def rate(c: Counter[str]) -> float | None:
        return round(c["issue_confirmed"] / c["reviewed"], 3) if c["reviewed"] else None

    return {
        "run_id": run_id,
        "feedback": per_signal,
        "review": {
            k: {
                "total": v["total"],
                "reviewed": v["reviewed"],
                "confirmed": v["issue_confirmed"],
                "hit_rate": rate(v),
            }
            for k, v in strata.items()
        },
    }

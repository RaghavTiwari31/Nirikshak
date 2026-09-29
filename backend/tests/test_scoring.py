"""Scoring, ranking, review packs, trend and anomaly signals (no database)."""

from datetime import date

import numpy as np
import pytest

from app.analytics.config import load_config
from app.analytics.evaluation import ndcg
from app.analytics.sampling import _allocate, build_pack, select_entities
from app.analytics.scoring import ScoredFinding, rank, score_entity
from app.analytics.signals import REGISTRY
from app.analytics.signals.base import EntityProfile
from app.analytics.signals.trends import cusum_onset
from tests.test_signals import ctx, frame

CFG = load_config()


def sf(
    i: int,
    capability: str = "escalation",
    severity: int = 4,
    confidence: float = 0.9,
    signal: str = "EG-02",
) -> ScoredFinding:
    return ScoredFinding(i, signal, f"finding {i}", capability, severity, confidence)


def test_capability_score_and_sai_formula() -> None:
    clean = score_entity(1, "A", "A", [], CFG.scoring)
    assert clean.sai == 0 and set(clean.capabilities.values()) == {100.0}
    one = score_entity(2, "B", "B", [sf(1)], CFG.scoring)
    # w = 3.6; S = 100*exp(-3.6/4) = 40.7; SAI = 100*(1-exp(-1.2*3.6/8)) = 41.7
    assert one.capabilities["escalation"] == pytest.approx(40.7, abs=0.1)
    assert one.sai == pytest.approx(41.7, abs=0.1)
    two = score_entity(3, "C", "C", [sf(1), sf(2, "threat_detection")], CFG.scoring)
    assert two.sai > one.sai and two.capabilities["investigation"] == 100


def test_rank_is_deterministic_with_ties() -> None:
    results = [
        score_entity(i, code, code, f, CFG.scoring)
        for i, (code, f) in enumerate(
            [("Z", [sf(1)]), ("A", [sf(2)]), ("M", []), ("B", [sf(3), sf(4, "governance", 1, 0.1)])]
        )
    ]
    ranked = rank(results)
    assert [r.code for r in ranked] == ["B", "A", "Z", "M"]
    assert [r.rank for r in ranked] == [1, 2, 3, 4]
    assert "is #1 of 4 for attention" in ranked[0].summary(4)
    assert "nothing found" in ranked[3].summary(4)


def test_allocate_largest_remainder() -> None:
    assert _allocate([3.6, 1.2, 1.2], 24) == [14, 5, 5]
    assert sum(_allocate([1, 1, 1], 10)) == 10
    assert _allocate([], 5) == []


def test_build_pack_directed_control_and_rollover() -> None:
    score = score_entity(7, "E", "E", [sf(1), sf(2, "investigation", 2, 0.5, "EG-03")], CFG.scoring)
    evidence = {
        1: [("alert", i, "no escalation") for i in range(100, 150)],
        2: [("case", i, "no steps") for i in range(10)] + [("aggregate", 0, "x")],
    }
    rows = build_pack(score, evidence, list(range(900, 940)), CFG.review)
    assert len(rows) == CFG.review.pack_size
    control = [r for r in rows if r.stratum == "random_control"]
    assert len(control) == round(CFG.review.pack_size * CFG.review.control_share)
    assert {r.stratum for r in rows} >= {"finding:EG-02", "finding:EG-03"}
    assert all(r.record_type in ("alert", "case", "asset") for r in rows)
    assert len({(r.record_type, r.record_id) for r in rows}) == len(rows)

    sparse = build_pack(score, {1: [("alert", 1, "x")]}, list(range(900, 940)), CFG.review)
    assert len(sparse) == CFG.review.pack_size  # missing evidence rolls into controls
    assert sum(r.stratum == "random_control" for r in sparse) == CFG.review.pack_size - 1


def test_select_entities_for_packs() -> None:
    results = rank(
        [
            score_entity(i, f"E{i:02d}", "x", [sf(i)] if i < 15 else [], CFG.scoring)
            for i in range(20)
        ]
    )
    chosen = select_entities(results, CFG.review)
    assert all(r.findings for r in chosen)
    assert len(chosen) >= CFG.review.top_entities


def test_ndcg() -> None:
    assert ndcg([4, 3, 2, 0, 0], 3) == 1.0
    assert ndcg([0, 0, 4], 3) == pytest.approx(0.5)  # log2(4) discount at position 3
    assert ndcg([0, 0, 0], 3) == 0.0


# ------------------------------------------------------------------ TR-01
def _monthly(close_h: list[float]) -> dict[date, dict[str, float]]:
    return {
        date(2025, 9 + i, 1) if i < 4 else date(2026, i - 3, 1): {
            "alerts": 100,
            "median_close_h": h,
            "median_ack_min": 30 * h / close_h[0],
            "escalation_rate": 0.7,
            "median_note_chars": 300,
        }
        for i, h in enumerate(close_h)
    }


def test_tr01_detects_deterioration_and_onset() -> None:
    sig = REGISTRY["TR-01"](CFG.signal("TR-01"), ctx())
    f = frame()
    f.features = _monthly([5, 5.2, 4.9, 5.1, 5, 5, 9, 12, 14, 15, 16, 17])
    m = sig.measure(f)
    assert m.triggered and m.details["deteriorated"] == 2 and m.value > 2.5
    assert m.details["onset"] == "Mar 2026"  # the first worse month
    f.features = _monthly([5, 5.2, 4.9, 5.1, 5, 5, 5.3, 4.8, 5.1, 5.2, 4.9, 5])
    assert not sig.measure(f).triggered
    f.features = _monthly([5] * 6)
    assert sig.measure(f).value is None  # not enough history


def test_cusum_onset() -> None:
    series = np.array([10, 10.5, 9.5, 10, 10, 10, 16, 18, 20])
    assert cusum_onset(series, series[:6], "up") == 6
    assert cusum_onset(series, series[:6], "down") is None


# ------------------------------------------------------------------ AN-01
def _profiles(extreme_flagged: set[str]) -> list[EntityProfile]:
    rng = np.random.default_rng(3)
    names = list(CFG.anomaly.features)
    profiles = []
    for i in range(24):
        feats = {n: float(1 + rng.normal(0, 0.05)) for n in names}
        profiles.append(EntityProfile(i, f"E{i:02d}", feats, 12, set()))
    odd = profiles[0]
    odd.features["top_analyst_share"] = 5.0
    odd.features["escalation_weekday_peak"] = 5.0
    odd.flagged = extreme_flagged
    return profiles


def test_an01_flags_only_unexplained_outliers() -> None:
    sig = REGISTRY["AN-01"](CFG.signal("AN-01"), ctx())
    out = sig.measure_population(_profiles(set()))
    odd = out["E00"]
    assert odd.triggered and "busiest analyst" in odd.details["drivers"]
    assert odd.value > np.median([m.value for m in out.values()])
    assert not any(m.triggered for code, m in out.items() if code != "E00")
    # The same extremes, already explained by rule findings, are not "unknown".
    explained = sig.measure_population(_profiles({"EG-09", "NS-04"}))
    assert not explained["E00"].triggered
    assert sig.measure_population(_profiles(set())[:5]) == {}  # too few peers

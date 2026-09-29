"""TR-01: sustained deterioration, judged against the entity's own history."""

from dataclasses import dataclass

import numpy as np

from app.analytics.data import EntityFrame
from app.analytics.features import fmt_feature
from app.analytics.signals.base import Evidence, Measure, Signal, register

MAX_RATIO = 10.0
CUSUM_K, CUSUM_H = 0.5, 4.0  # slack and decision interval, in baseline standard deviations


@dataclass(frozen=True)
class TrendMetric:
    feature: str
    worse: str  # "up" or "down"
    label: str
    floor: float  # ignore metrics whose baseline is below this (too sparse to judge)


METRICS = (
    TrendMetric("median_close_h", "up", "median time to close", 0.05),
    TrendMetric("median_ack_min", "up", "median time to acknowledge", 1.0),
    TrendMetric("escalation_rate", "down", "escalation rate of serious cases", 0.05),
    TrendMetric("median_note_chars", "down", "median closing-note length", 10.0),
)


def cusum_onset(values: np.ndarray, baseline: np.ndarray, worse: str) -> int | None:
    """Index where the first sustained upward (worsening) excursion began, or None."""
    mu = float(np.median(baseline))
    sd = max(1.4826 * float(np.median(np.abs(baseline - mu))), 0.1 * abs(mu), 1e-6)
    sign = 1.0 if worse == "up" else -1.0
    s, start = 0.0, 0
    for i, x in enumerate(values):
        step = sign * (x - mu) / sd - CUSUM_K
        if s == 0.0 and step > 0:
            start = i
        s = max(0.0, s + step)
        if s > CUSUM_H:
            return start
    return None


@register
class Deterioration(Signal):
    id = "TR-01"

    def measure(self, f: EntityFrame) -> Measure:
        months = [m for m in sorted(f.features) if f.features[m].get("alerts", 0) > 0]
        base_n, recent_n = self.p["baseline_months"], self.p["recent_months"]
        if len(months) < base_n + recent_n:
            return Measure(value=None, support=len(months), triggered=False)

        worst_ratio = 1.0
        worst: tuple[TrendMetric, np.ndarray] | None = None
        deteriorated: list[str] = []
        evidence: list[Evidence] = []
        for metric in METRICS:
            series = np.array([f.features[m].get(metric.feature, 0.0) for m in months])
            baseline, recent = series[:base_n], series[-recent_n:]
            b, r = float(np.median(baseline)), float(np.median(recent))
            if b < metric.floor:
                continue
            ratio = r / b if metric.worse == "up" else (b / r if r > 0 else MAX_RATIO)
            ratio = min(ratio, MAX_RATIO)
            if ratio > worst_ratio:
                worst_ratio, worst = ratio, (metric, series)
            if ratio >= self.p["min_ratio"]:
                verb = "rose" if metric.worse == "up" else "fell"
                text = (
                    f"The {metric.label} {verb} from {fmt_feature(metric.feature, b)} to "
                    f"{fmt_feature(metric.feature, r)} ({ratio:.1f}x worse)."
                )
                deteriorated.append(text)
                evidence.append(Evidence("aggregate", None, text))

        onset = "n/a"
        if worst is not None:
            metric, series = worst
            idx = cusum_onset(series, series[:base_n], metric.worse)
            if idx is not None:
                onset = f"{months[idx]:%b %Y}"
        return Measure(
            value=worst_ratio,
            support=len(months),
            triggered=len(deteriorated) >= self.p["min_metrics"],
            details={
                "metrics_text": " ".join(deteriorated),
                "onset": onset,
                "deteriorated": len(deteriorated),
            },
            evidence=evidence,
        )

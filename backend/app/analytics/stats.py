"""Small, explainable statistics used by the signals."""

from dataclasses import dataclass

import numpy as np
from scipy import stats

MAD_TO_SD = 1.4826  # scales the median absolute deviation to a normal SD
MEANAD_TO_SD = 1.2533  # same for the mean absolute deviation (used when MAD is 0)


@dataclass(frozen=True)
class Baseline:
    """Peer distribution of one signal's metric across all evaluable entities."""

    median: float
    scale: float
    n: int
    values: dict[str, float]  # entity code -> metric (kept for peer charts)

    def z(self, x: float) -> float:
        return (x - self.median) / self.scale

    def percentile(self, x: float) -> float:
        v = np.fromiter(self.values.values(), float)
        return float((v <= x).mean()) if len(v) else 0.0


def baseline(values: dict[str, float], min_scale: float | None = None) -> Baseline:
    """Median and a robust scale. Falls back to mean absolute deviation when most peers
    share one value (e.g. almost everyone at 0%), so a single outlier still stands out."""
    v = np.fromiter(values.values(), float)
    if len(v) == 0:
        return Baseline(0.0, 1.0, 0, {})
    med = float(np.median(v))
    scale = MAD_TO_SD * float(np.median(np.abs(v - med)))
    if scale == 0:
        scale = MEANAD_TO_SD * float(np.mean(np.abs(v - med)))
    scale = max(scale, min_scale or 0.0, 1e-9)
    return Baseline(med, scale, len(v), values)


def poisson_low_p(observed: np.ndarray, expected: np.ndarray) -> np.ndarray:
    """P(X <= observed) for X ~ Poisson(expected): how surprising a shortfall is."""
    return np.asarray(stats.poisson.cdf(observed, expected), dtype=float)


def binomial_excess_p(k: int, n: int, p: float = 0.5) -> float:
    """One-sided P(X >= k) for X ~ Binomial(n, p)."""
    if n == 0:
        return 1.0
    return float(stats.binom.sf(k - 1, n, p))


def benjamini_hochberg(pvals: np.ndarray, alpha: float) -> np.ndarray:
    """Boolean mask of discoveries controlling the false discovery rate at alpha."""
    p = np.asarray(pvals, dtype=float)
    m = len(p)
    if m == 0:
        return np.zeros(0, dtype=bool)
    order = np.argsort(p)
    thresholds = alpha * np.arange(1, m + 1) / m
    passed = p[order] <= thresholds
    k = int(np.max(np.nonzero(passed)[0])) + 1 if passed.any() else 0
    mask = np.zeros(m, dtype=bool)
    mask[order[:k]] = True
    return mask


def longest_zero_run(counts: np.ndarray) -> tuple[int, int]:
    """(length, start index) of the longest run of zeros."""
    best_len, best_start, cur_len, cur_start = 0, -1, 0, 0
    for i, c in enumerate(counts):
        if c == 0:
            if cur_len == 0:
                cur_start = i
            cur_len += 1
            if cur_len > best_len:
                best_len, best_start = cur_len, cur_start
        else:
            cur_len = 0
    return best_len, best_start

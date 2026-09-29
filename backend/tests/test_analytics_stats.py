import numpy as np

from app.analytics.narrative import render
from app.analytics.stats import (
    baseline,
    benjamini_hochberg,
    binomial_excess_p,
    longest_zero_run,
    poisson_low_p,
)


def test_baseline_is_robust_to_outliers() -> None:
    b = baseline({f"e{i}": 0.1 for i in range(9)} | {"bad": 0.9})
    assert b.median == 0.1
    # MAD is 0 here, so the mean-absolute-deviation fallback applies and still flags it.
    assert b.z(0.9) > 5


def test_baseline_min_scale_caps_z() -> None:
    tight = {f"e{i}": 0.70 + i * 0.001 for i in range(10)}
    assert baseline(tight).z(0.65) < -5
    assert baseline(tight, min_scale=0.05).z(0.65) > -1.5


def test_benjamini_hochberg() -> None:
    p = np.array([0.0001, 0.2, 0.004, 0.9])
    assert benjamini_hochberg(p, 0.01).tolist() == [True, False, True, False]
    assert benjamini_hochberg(np.array([]), 0.05).size == 0


def test_poisson_and_binomial() -> None:
    assert poisson_low_p(np.array([0]), np.array([10.0]))[0] < 1e-4
    assert poisson_low_p(np.array([10]), np.array([10.0]))[0] > 0.5
    assert binomial_excess_p(50, 60) < 1e-6
    assert binomial_excess_p(30, 60) > 0.4


def test_longest_zero_run() -> None:
    assert longest_zero_run(np.array([1, 0, 0, 3, 0, 0, 0, 2])) == (3, 4)
    assert longest_zero_run(np.array([1, 2])) == (0, -1)


def test_render_is_forgiving() -> None:
    assert render("{a:.0%} of {b}", {"a": 0.25, "b": 4}) == "25% of 4"
    assert render("x {missing}", {}) == "x n/a"
    assert render("{a:.1f}", {"a": None}) == "0.0"

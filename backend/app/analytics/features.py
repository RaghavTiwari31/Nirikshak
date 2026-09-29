"""Monthly entity features: the time series behind trends and the anomaly model (Phase 3).

Every feature is a plain, explainable operational metric, so an outlier can always be
described in supervisory language ("escalation rate 0.02 vs peer median 0.18").
"""

from datetime import date
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from app.analytics.data import EntityFrame, RunContext

FEATURES: dict[str, str] = {
    "alerts": "Alerts raised per month",
    "alerts_per_asset": "Alerts per machine per month",
    "high_crit_share": "Share of alerts that are serious",
    "median_ack_min": "Typical minutes until someone responds",
    "median_close_h": "Typical hours to close an alert",
    "median_close_h_high_crit": "Typical hours to close a serious alert",
    "tp_rate_high_crit": "Share of serious alerts confirmed as real",
    "unacknowledged_share": "Share of alerts closed without anyone looking",
    "cases_per_100_alerts": "Cases opened per 100 alerts",
    "escalation_rate": "Share of serious cases passed upward",
    "external_escalations": "Reports to CERT-In / NCIIPC per month",
    "median_note_chars": "Typical closing-note length",
    "no_work_case_share": "Share of cases closed without real work",
    "night_day_ack_ratio": "How much slower night alerts are picked up",
    "top_analyst_share": "Share of closures by the busiest analyst",
    "escalation_weekday_peak": "Share of escalations on the busiest weekday",
    "reopen_share": "Share of cases reopened",
}


PERCENT_FEATURES = {
    "high_crit_share",
    "tp_rate_high_crit",
    "unacknowledged_share",
    "escalation_rate",
    "no_work_case_share",
    "top_analyst_share",
    "escalation_weekday_peak",
    "reopen_share",
}


def fmt_feature(name: str, value: float) -> str:
    """Human-readable value for narratives and tables."""
    if name in PERCENT_FEATURES:
        return f"{value:.0%}"
    if name.endswith("_min"):
        return f"{value:.0f} min"
    if name.endswith("_h") or name.endswith("_h_high_crit"):
        return f"{value:.1f} h"
    if name == "night_day_ack_ratio":
        return f"{value:.1f}x"
    return f"{value:.2f}" if abs(value) < 10 else f"{value:.0f}"


def _safe_ratio(a: float, b: float) -> float:
    return float(a / b) if b else 0.0


def _median(s: pd.Series) -> float:
    return float(s.median()) if len(s) else 0.0


def compute_features(
    a: pd.DataFrame, c: pd.DataFrame, e: pd.DataFrame, n_assets: int, months: int, tz: ZoneInfo
) -> dict[str, float]:
    """The feature vector for any slice of an entity's evidence (a month or the window).
    Count-like features are normalised per month so slices of different lengths compare."""
    closed = a[a.closed_at.notna()]
    hc = closed[closed.severity.isin(("high", "critical"))]
    serious = c[c.priority.isin(("high", "critical")) & c.is_tp]
    acked = a[a.ack_min.notna()]
    night = acked[(acked.local_hour >= 22) | (acked.local_hour < 6)].ack_min
    day = acked[(acked.local_hour >= 10) & (acked.local_hour < 18)].ack_min
    closers = closed.analyst_hash.value_counts(normalize=True)
    weekday = e.ts.dt.tz_convert(tz).dt.weekday.value_counts(normalize=True)
    closed_cases = c[c.closed_at.notna()]
    no_work = (closed_cases.n_comment + closed_cases.n_contain == 0).mean()
    months = max(months, 1)
    out = {
        "alerts": len(a) / months,
        "alerts_per_asset": len(a) / max(n_assets, 1) / months,
        "high_crit_share": _safe_ratio(a.severity.isin(("high", "critical")).sum(), len(a)),
        "median_ack_min": _median(acked.ack_min),
        "median_close_h": _median(closed.ttc_h),
        "median_close_h_high_crit": _median(hc.ttc_h),
        "tp_rate_high_crit": _safe_ratio((hc.disposition == "tp").sum(), len(hc)),
        "unacknowledged_share": _safe_ratio(closed.acknowledged_at.isna().sum(), len(closed)),
        "cases_per_100_alerts": _safe_ratio(100 * len(c), len(a)),
        "escalation_rate": _safe_ratio(
            ((serious.n_escalations > 0) | serious.escalated).sum(), len(serious)
        ),
        "external_escalations": e.to_tier.isin(("cert_in", "nciipc")).sum() / months,
        "median_note_chars": _median(c.resolution_note.fillna("").str.len()),
        "no_work_case_share": float(no_work) if len(closed_cases) else 0.0,
        "night_day_ack_ratio": _safe_ratio(_median(night), max(_median(day), 1.0))
        if len(night) >= 5 and len(day) >= 5
        else 0.0,
        "top_analyst_share": float(closers.iloc[0]) if len(closers) else 0.0,
        "escalation_weekday_peak": float(weekday.iloc[0]) if len(e) >= 5 else 0.0,
        "reopen_share": _safe_ratio((c.reopened_count > 0).sum(), len(c)),
    }
    return {k: (0.0 if not np.isfinite(v) else round(float(v), 5)) for k, v in out.items()}


def _month(s: pd.Series, tz: ZoneInfo) -> pd.Series:
    return s.dt.tz_convert(tz).dt.tz_localize(None).dt.to_period("M")


def monthly_features(f: EntityFrame, ctx: RunContext) -> dict[date, dict[str, float]]:
    tz = ctx.tz
    a_month, c_month = _month(f.alerts.created_at, tz), _month(f.cases.opened_at, tz)
    e_month = _month(f.escalations.ts, tz)
    out: dict[date, dict[str, float]] = {}
    for m in ctx.months:
        p = pd.Period(m, "M")
        out[m] = compute_features(
            f.alerts[a_month == p],
            f.cases[c_month == p],
            f.escalations[e_month == p],
            len(f.assets),
            1,
            tz,
        )
    return out


def window_features(f: EntityFrame, ctx: RunContext) -> dict[str, float]:
    """Whole-window features: more stable than monthly medians for sparse metrics."""
    return compute_features(
        f.alerts, f.cases, f.escalations, len(f.assets), len(ctx.months), ctx.tz
    )

"""Negative space: evidence that should exist but does not.

The expected-evidence model: for each asset type (and alert category), peers establish a
normal rate of alerts per asset per day. An entity's expected count is its asset count x
the leave-one-out peer median rate x days in the window. Shortfalls are tested with a
Poisson tail probability, and many simultaneous tests are corrected with
Benjamini-Hochberg so chance gaps are not over-reported.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.analytics.data import EntityFrame, category_label
from app.analytics.signals.base import Evidence, Measure, Signal, ids, register
from app.analytics.stats import benjamini_hochberg, longest_zero_run, poisson_low_p
from app.domain.taxonomy import CATEGORIES, OT_ASSET_TYPES

ASSET_LABEL = {
    "dc": "domain controllers",
    "server": "servers",
    "endpoint": "endpoints",
    "firewall": "firewalls",
    "db": "databases",
    "ot_scada": "SCADA systems",
    "ot_hmi": "HMIs",
    "cloud": "cloud workloads",
    "email_gw": "email gateways",
}
OT_TYPES = {t.value for t in OT_ASSET_TYPES}


@register
class SilentCriticalAssets(Signal):
    id = "NS-01"

    def measure(self, f: EntityFrame) -> Measure:
        crit = f.assets[f.assets.criticality >= 3]
        counts = f.alerts.asset_id.value_counts()
        rows = []
        for _, asset in crit.iterrows():
            rate = self.ctx.peer_rate(f.info.id, asset.asset_type)
            if rate is None:
                continue
            expected = rate * self.ctx.days
            if expected >= self.p["min_expected"]:
                rows.append(
                    (int(asset.id), asset.asset_type, expected, int(counts.get(asset.id, 0)))
                )
        if not rows:
            return Measure(value=None, support=0, triggered=False)
        tested = pd.DataFrame(rows, columns=["id", "asset_type", "expected", "observed"])
        p = poisson_low_p(tested.observed.to_numpy(), tested.expected.to_numpy())
        tested["significant"] = benjamini_hochberg(p, self.p["alpha"]) & (tested.observed == 0)
        silent = tested[tested.significant].sort_values("expected", ascending=False)
        by_type = silent.asset_type.value_counts()
        return Measure(
            value=len(silent) / len(tested),
            support=len(tested),
            triggered=len(silent) >= self.p["min_silent"],
            details={
                "silent": len(silent),
                "expected_median": float(silent.expected.median()) if len(silent) else 0,
                "by_type": {ASSET_LABEL.get(k, k): int(v) for k, v in by_type.items()},
            },
            evidence=[
                Evidence("asset", int(r.id), f"0 alerts; ~{r.expected:.0f} expected from peers")
                for r in silent.head(50).itertuples()
            ],
        )


@register
class MissingCategories(Signal):
    id = "NS-02"

    def measure(self, f: EntityFrame) -> Measure:
        """Also returns the full expected-vs-observed matrix for the coverage heatmap."""
        assets = f.assets.set_index("id")
        joined = f.alerts[f.alerts.asset_id.notna()].join(assets.asset_type, on="asset_id")
        observed = joined.groupby(["asset_type", "category"]).size()
        cells = []
        for asset_type, n_assets in assets.asset_type.value_counts().items():
            for key, cat in CATEGORIES.items():
                if asset_type not in {t.value for t in cat.asset_types}:
                    continue
                rate = self.ctx.peer_rate(f.info.id, str(asset_type), key)
                if rate is None:
                    continue
                expected = n_assets * rate * self.ctx.days
                cells.append(
                    {
                        "asset_type": asset_type,
                        "category": key,
                        "expected": round(expected, 1),
                        "observed": int(observed.get((asset_type, key), 0)),
                    }
                )
        if not cells:
            return Measure(value=None, support=0, triggered=False)
        matrix = pd.DataFrame(cells)
        tested = matrix[matrix.expected >= self.p["min_expected"]].copy()
        p = poisson_low_p(tested.observed.to_numpy(), tested.expected.to_numpy())
        tested["missing"] = benjamini_hochberg(p, self.p["alpha"]) & (tested.observed == 0)
        missing = tested[tested.missing].sort_values("expected", ascending=False)
        labels = [
            f"{category_label(r.category)} on "  # keep label casing (OT, SCADA)
            f"{ASSET_LABEL.get(r.asset_type, r.asset_type)} (~{r.expected:.0f} expected)"
            for r in missing.itertuples()
        ]
        return Measure(
            value=float(len(missing)),
            support=len(tested),
            triggered=len(missing) > 0,
            details={"cells": "; ".join(labels), "matrix": matrix.to_dict("records")},
            evidence=[Evidence("aggregate", None, lbl) for lbl in labels],
            strength=min(1.0, len(missing) / 3),
        )


@register
class TelemetrySilence(Signal):
    id = "NS-03"

    def measure(self, f: EntityFrame) -> Measure:
        if f.volume.empty:
            return Measure(value=None, support=0, triggered=False)
        crit_ids = set(f.assets.id[f.assets.criticality >= 3])
        v = f.volume[f.volume.asset_id.isin(crit_ids)]
        # Only judge days the entity was actually reporting telemetry for: up to its last
        # reported day, and never in months with no accepted submission (that is NS-08's
        # evidence, and would otherwise make every source look silent).
        covered = covered_months(f, self.ctx.months)
        days = [
            d
            for d in pd.date_range(self.ctx.window_start, max(f.volume.day), inclusive="both").date
            if d.replace(day=1) in covered
        ]
        silent, longest, evidence = 0, 0, []
        for (asset_id, tool), grp in v.groupby(["asset_id", "source_tool"]):
            # A day with no row counts as silent too, once the source has started reporting.
            series = grp.set_index("day").event_count.reindex(days)
            first = series.first_valid_index()
            if first is None:
                continue
            reported = series.loc[first:]
            run, start = longest_zero_run(reported.fillna(0).to_numpy())
            if run >= self.p["min_days"]:
                silent += 1
                longest = max(longest, run)
                evidence.append(
                    Evidence(
                        "asset",
                        int(asset_id),
                        f"{tool.upper()} silent {run} days from {reported.index[start]:%d %b %Y}",
                    )
                )
        return Measure(
            value=float(longest),
            support=v.groupby(["asset_id", "source_tool"]).ngroups,
            triggered=silent > 0,
            details={"sources": silent, "longest": longest},
            evidence=evidence[:50],
            strength=min(1.0, longest / 60),
        )


@register
class NoEscalations(Signal):
    id = "NS-04"

    def measure(self, f: EntityFrame) -> Measure:
        c = f.cases[f.cases.priority.isin(("high", "critical")) & f.cases.is_tp]
        esc = c[(c.n_escalations > 0) | c.escalated]
        missed = c[~c.id.isin(esc.id)]
        share = len(esc) / len(c) if len(c) else None
        return Measure(
            value=share,
            support=len(c),
            triggered=share is not None and share <= self.p["max_share"],
            details={"count": len(esc)},
            evidence=ids(missed, "case", "confirmed serious case, never escalated"),
        )


@register
class OrphanTruePositives(Signal):
    id = "NS-05"

    def measure(self, f: EntityFrame) -> Measure:
        tp = f.alerts[(f.alerts.disposition == "tp") & (f.alerts.severity != "low")]
        orphans = tp[tp.case_id.isna()]
        share = len(orphans) / len(tp) if len(tp) else 0.0
        return Measure(
            value=share,
            support=len(tp),
            triggered=share >= self.p["min_share"],
            details={"count": len(orphans)},
            evidence=ids(orphans, "alert", "confirmed alert without a case"),
        )


@register
class LowActivity(Signal):
    id = "NS-06"

    def measure(self, f: EntityFrame) -> Measure:
        n_assets = len(f.assets)
        months = max(len(self.ctx.months), 1)
        if n_assets == 0:
            return Measure(value=None, support=0, triggered=False)
        rate = len(f.alerts) / n_assets / months
        # Compared on a log scale: activity levels are multiplicative, not additive.
        return Measure(
            value=rate, support=n_assets, triggered=True, peer_value=float(np.log(max(rate, 1e-3)))
        )

    def display(self, comparable: float) -> float:
        return float(np.exp(comparable))


@register
class OtBlindSpot(Signal):
    id = "NS-07"

    def measure(self, f: EntityFrame) -> Measure:
        ot = f.assets[f.assets.asset_type.isin(OT_TYPES)]
        if ot.empty:
            return Measure(value=None, support=0, triggered=False)
        ot_alerts = int((f.alerts.source_tool == "ot_ids").sum())
        ot_volume = f.volume[(f.volume.source_tool == "ot_ids") & (f.volume.event_count > 0)]
        blind = ot_alerts == 0 and ot_volume.empty
        return Measure(
            value=float(len(ot)),
            support=len(ot),
            triggered=blind,
            details={"ot_alerts": ot_alerts},
            evidence=ids(
                ot.sort_values("criticality", ascending=False),
                "asset",
                "OT asset with no OT monitoring evidence",
            ),
        )


@register
class MissingSubmissions(Signal):
    id = "NS-08"

    def measure(self, f: EntityFrame) -> Measure:
        covered = covered_months(f, self.ctx.months)
        missing = [m for m in self.ctx.months if m not in covered]
        return Measure(
            value=float(len(missing)),
            support=len(self.ctx.months),
            triggered=bool(missing),
            details={"months": ", ".join(f"{m:%b %Y}" for m in missing)},
            evidence=[Evidence("aggregate", None, f"no submission for {m:%b %Y}") for m in missing],
            strength=min(1.0, len(missing) / 3),
        )


def _next_month(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def covered_months(f: EntityFrame, months: list[date]) -> set[date]:
    """Months (first-of-month dates) overlapped by at least one non-rejected submission."""
    ok = f.submissions[f.submissions.status != "rejected"]
    return {
        m
        for m in months
        for s in ok.itertuples()
        if s.period_start < _next_month(m) and s.period_end >= m
    }

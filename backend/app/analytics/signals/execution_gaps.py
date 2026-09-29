"""Execution gaps: controls that look effective on paper but not in the evidence."""

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

from app.analytics.data import EntityFrame
from app.analytics.signals.base import Evidence, Measure, Signal, ids, register
from app.analytics.stats import binomial_excess_p

HIGH_CRIT = ("high", "critical")


def _share(part: int, whole: int) -> float:
    return part / whole if whole else 0.0


def _handled(f: EntityFrame) -> pd.DataFrame:
    """Closed alerts an analyst actually touched. Alerts auto-closed with no human at all
    are EG-12's evidence (an unmonitored tool), not analyst behaviour."""
    a = f.closed_alerts
    return a[a.acknowledged_at.notna() | a.analyst_hash.notna()]


@register
class RapidClosure(Signal):
    id = "EG-01"

    def measure(self, f: EntityFrame) -> Measure:
        handled = _handled(f)
        hc = handled[handled.severity.isin(HIGH_CRIT)]
        fast = hc[hc.ttc_h * 60 <= self.p["max_minutes"]]
        share = _share(len(fast), len(hc))
        return Measure(
            value=share,
            support=len(hc),
            triggered=share >= self.p["min_share"],
            details={"count": len(fast), "max_minutes": self.p["max_minutes"]},
            evidence=ids(fast.sort_values(["severity", "ttc_h"]), "alert", "closed within minutes"),
        )


@register
class CriticalWithoutEscalation(Signal):
    id = "EG-02"

    def measure(self, f: EntityFrame) -> Measure:
        a = f.closed_alerts
        crit_tp = a[(a.severity == "critical") & (a.disposition == "tp")]
        escalated_cases = set(f.cases.id[(f.cases.n_escalations > 0) | f.cases.escalated])
        missed = crit_tp[~crit_tp.case_id.isin(escalated_cases)]
        share = _share(len(missed), len(crit_tp))
        return Measure(
            value=share,
            support=len(crit_tp),
            triggered=share >= self.p["min_share"],
            details={"count": len(missed)},
            evidence=ids(missed, "alert", "confirmed critical, no escalation"),
        )


@register
class NoInvestigation(Signal):
    id = "EG-03"

    def measure(self, f: EntityFrame) -> Measure:
        c = f.cases[f.cases.closed_at.notna()]
        note_len = c.resolution_note.fillna("").str.len()
        no_work = (c.n_comment + c.n_contain == 0) | (note_len < self.p["min_note_chars"])
        hit = c[no_work]
        share = _share(len(hit), len(c))
        return Measure(
            value=share,
            support=len(c),
            triggered=share >= self.p["min_share"],
            details={"count": len(hit)},
            evidence=ids(hit, "case", "no investigation steps or token note"),
        )


@register
class TemplateNotes(Signal):
    id = "EG-04"
    CHUNK = 400

    def measure(self, f: EntityFrame) -> Measure:
        c = f.cases[f.cases.resolution_note.fillna("").str.len() > 0].reset_index(drop=True)
        if len(c) < 2:
            return Measure(value=None, support=len(c), triggered=False)
        vec = TfidfVectorizer(
            analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, dtype=np.float32
        )
        x = vec.fit_transform(c.resolution_note.str.lower())
        best = np.zeros(len(c), dtype=np.float32)
        for start in range(0, len(c), self.CHUNK):  # chunked to keep memory bounded
            sim = (x[start : start + self.CHUNK] @ x.T).toarray()
            for i in range(sim.shape[0]):
                sim[i, start + i] = 0.0  # ignore self-similarity
            best[start : start + sim.shape[0]] = sim.max(axis=1)
        dup = c[best >= self.p["similarity"]]
        share = _share(len(dup), len(c))
        by_analyst = dup.assignee_hash.value_counts(normalize=True)
        top = by_analyst.head(2)
        return Measure(
            value=share,
            support=len(c),
            triggered=share >= self.p["min_share"],
            details={
                "count": len(dup),
                "top_analysts": len(top),
                "top_analyst_share": float(top.sum()) if len(top) else 0.0,
            },
            evidence=ids(dup, "case", "near-identical closing note"),
        )


@register
class SlaBunching(Signal):
    id = "EG-05"

    def measure(self, f: EntityFrame) -> Measure:
        a = f.closed_alerts
        sla = {**self.ctx.default_sla, **f.info.declared_sla}
        frac = a.ttc_h / a.severity.map(sla)
        band = self.p["band"]
        below_mask = (frac >= 1 - band) & (frac < 1)
        above_mask = (frac >= 1) & (frac < 1 + band)
        below, above = int(below_mask.sum()), int(above_mask.sum())
        ratio = below / max(above, 1)
        p_value = binomial_excess_p(below, below + above)
        return Measure(
            value=ratio,
            support=len(a),
            triggered=ratio >= self.p["min_ratio"] and p_value <= self.p["max_p"],
            details={
                "below": below,
                "above": above,
                "p_value": p_value,
                "declared_sla": bool(f.info.declared_sla),
            },
            evidence=ids(a[below_mask].sort_values("ttc_h"), "alert", "closed just under SLA"),
            strength=min(1.0, ratio / (3 * self.p["min_ratio"])),
        )


@register
class RecurringWithoutRemediation(Signal):
    id = "EG-06"

    def measure(self, f: EntityFrame) -> Measure:
        tp = f.alerts[(f.alerts.disposition == "tp") & f.alerts.asset_id.notna()]
        cases = f.cases.set_index("id")
        unremediated = cases.root_cause.isna() & cases.remediation_action.isna()
        clusters, evidence, repeats = 0, [], 0
        for (_asset, _rule), grp in tp.groupby(["asset_id", "rule_ref"]):
            if len(grp) < self.p["min_repeats"]:
                continue
            linked = grp.case_id.dropna().astype(int)
            linked = linked[linked.isin(unremediated.index)]
            if len(linked) and unremediated.loc[linked].mean() >= self.p["min_unremediated"]:
                clusters += 1
                repeats += len(grp)
                evidence += ids(grp, "alert", "repeat incident, no root cause/remediation", 10)
        return Measure(
            value=float(clusters),
            support=max(len(tp), 1),
            triggered=clusters >= self.p["min_clusters"],
            details={"repeats": repeats},
            evidence=evidence[:50],
        )


@register
class LowTruePositiveRate(Signal):
    id = "EG-07"

    def measure(self, f: EntityFrame) -> Measure:
        handled = _handled(f)
        hc = handled[handled.severity.isin(HIGH_CRIT)]
        dismissed = hc[hc.disposition != "tp"]
        return Measure(
            value=_share(int((hc.disposition == "tp").sum()), len(hc)),
            support=len(hc),
            triggered=True,
            evidence=ids(dismissed, "alert", "high-severity closed as non-TP"),
        )


@register
class DeclaredVsObserved(Signal):
    id = "EG-08"

    def measure(self, f: EntityFrame) -> Measure:
        a = f.closed_alerts
        claims: list[str] = []
        strengths: list[float] = []
        mttr_ratio = None
        if f.info.declared_mttr_hours and len(a):
            observed = float(a.ttc_h.mean())
            mttr_ratio = observed / f.info.declared_mttr_hours
            if mttr_ratio >= self.p["min_mttr_ratio"]:
                claims.append(
                    f"Declared mean time to resolve is {f.info.declared_mttr_hours:.1f} h, but "
                    f"alerts actually took {observed:.1f} h on average ({mttr_ratio:.1f}x)."
                )
                strengths.append((mttr_ratio - 1) / 2)
        night_ratio = _night_day_ratio(f)
        if f.info.declared_24x7 and night_ratio and night_ratio[0] >= self.p["max_night_ratio"]:
            claims.append(
                f"The entity declares 24x7 monitoring, but night-time alerts wait "
                f"{night_ratio[0]:.0f}x longer for acknowledgement than daytime ones."
            )
            strengths.append(night_ratio[0] / 20)
        value = mttr_ratio if mttr_ratio is not None else (night_ratio[0] if night_ratio else None)
        return Measure(
            value=value,
            support=len(a),
            triggered=bool(claims),
            details={
                "claims": " ".join(claims),
                "mttr_ratio": mttr_ratio,
                "night_ratio": night_ratio[0] if night_ratio else None,
            },
            evidence=[Evidence("aggregate", None, c) for c in claims],
            strength=max(strengths, default=0.0),
        )


def _night_day_ratio(f: EntityFrame) -> tuple[float, float, float] | None:
    """(ratio, night median minutes, day median minutes) for acknowledged alerts."""
    a = f.alerts[f.alerts.ack_min.notna()]
    night = a[(a.local_hour >= 22) | (a.local_hour < 6)].ack_min
    day = a[(a.local_hour >= 10) & (a.local_hour < 18)].ack_min
    if len(night) < 10 or len(day) < 10:
        return None
    night_med, day_med = float(night.median()), float(day.median())
    return night_med / max(day_med, 1.0), night_med, day_med


@register
class BulkClosure(Signal):
    id = "EG-09"

    def measure(self, f: EntityFrame) -> Measure:
        a = f.closed_alerts[f.closed_alerts.analyst_hash.notna()]
        minute = a.closed_at.dt.floor("min")
        sizes = a.groupby([a.analyst_hash, minute]).id.transform("size")
        in_batch = a[sizes >= self.p["batch_size"]]
        batches = in_batch.groupby(
            [in_batch.analyst_hash, in_batch.closed_at.dt.floor("min")]
        ).ngroups
        share = _share(len(in_batch), len(f.closed_alerts))
        return Measure(
            value=share,
            support=len(f.closed_alerts),
            triggered=share >= self.p["min_share"],
            details={
                "count": len(in_batch),
                "batches": batches,
                "batch_size": self.p["batch_size"],
            },
            evidence=ids(in_batch.sort_values("closed_at"), "alert", "closed in a batch"),
        )


@register
class NightShiftGap(Signal):
    id = "EG-10"

    def measure(self, f: EntityFrame) -> Measure:
        if not f.info.declared_24x7:
            return Measure(value=None, support=0, triggered=False)
        r = _night_day_ratio(f)
        if r is None:
            return Measure(value=None, support=0, triggered=False)
        ratio, night_med, day_med = r
        a = f.alerts
        night = a[((a.local_hour >= 22) | (a.local_hour < 6)) & a.ack_min.notna()]
        return Measure(
            value=ratio,
            support=len(night),
            triggered=ratio >= self.p["min_ratio"] and night_med >= self.p["min_night_minutes"],
            details={"night_minutes": night_med, "day_minutes": day_med},
            evidence=ids(
                night.sort_values("ack_min", ascending=False),
                "alert",
                "night alert waited for acknowledgement",
            ),
            strength=min(1.0, ratio / 20),
        )


@register
class Reopens(Signal):
    id = "EG-11"

    def measure(self, f: EntityFrame) -> Measure:
        reopened = f.cases[f.cases.reopened_count > 0]
        share = _share(len(reopened), len(f.cases))
        return Measure(
            value=share,
            support=len(f.cases),
            triggered=share >= self.p["min_share"],
            details={"count": len(reopened)},
            evidence=ids(reopened, "case", "reopened"),
        )


@register
class UnmonitoredTool(Signal):
    id = "EG-12"

    def measure(self, f: EntityFrame) -> Measure:
        a = f.closed_alerts
        human = a.acknowledged_at.notna() | a.analyst_hash.notna()
        by_tool = pd.DataFrame({"tool": a.source_tool, "human": human}).groupby("tool").human
        stats = by_tool.agg(["mean", "size"])
        eligible = stats[stats["size"] >= self.cfg.min_support]
        bad = eligible[eligible["mean"] <= self.p["max_human_share"]]
        unseen = a[a.source_tool.isin(bad.index) & ~human]
        worst = float(1 - eligible["mean"].min()) if len(eligible) else None
        return Measure(
            value=worst,
            support=len(a),
            triggered=len(bad) > 0,
            details={"tools": ", ".join(t.upper() for t in bad.index), "count": len(unseen)},
            evidence=ids(unseen, "alert", "never acknowledged by an analyst"),
        )

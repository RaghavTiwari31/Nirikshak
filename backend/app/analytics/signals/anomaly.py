"""AN-01: unusual operating patterns that no rule explains.

1. Each entity is described by its whole-window feature vector.
2. Features are robust-scaled (median / MAD, with a relative floor) against peers in the
   same cohort (24x7 vs business-hours SOCs), so like is compared with like.
3. Features already explained by one of the entity's rule-based findings are neutralised
   (set to the peer median), using the `anomaly.features` map in signals.yaml.
4. An Isolation Forest scores how isolated each entity is in this *residual* space, and
   the most extreme remaining features explain why.
An entity is reported only when it is an outlier AND at least `min_unexplained` of its
extreme features are unexplained, so the signal surfaces genuinely new patterns.
"""

import numpy as np
from sklearn.ensemble import IsolationForest

from app.analytics.config import AnalyticsConfig, SignalConfig, load_config
from app.analytics.data import RunContext
from app.analytics.features import FEATURES, fmt_feature
from app.analytics.signals.base import (
    EntityProfile,
    Evidence,
    Measure,
    PopulationSignal,
    register,
)

Z_CLIP = 8.0
MIN_PEERS = 8


@register
class UnexplainedAnomaly(PopulationSignal):
    id = "AN-01"

    def __init__(
        self, cfg: SignalConfig, ctx: RunContext, analytics: AnalyticsConfig | None = None
    ) -> None:
        super().__init__(cfg, ctx)
        self.explained_by = (analytics or load_config()).anomaly.features

    def _standardise(self, x: np.ndarray, cohorts: list[str]) -> tuple[np.ndarray, np.ndarray]:
        """Robust z-scores within cohort (falls back to all peers for small cohorts).
        Returns (z, peer medians used for each entity)."""
        z = np.zeros_like(x)
        medians = np.zeros_like(x)
        labels = np.array(cohorts)
        for cohort in set(cohorts):
            rows = labels == cohort
            ref = x[rows] if rows.sum() >= self.p["min_cohort"] else x
            med = np.median(ref, axis=0)
            mad = 1.4826 * np.median(np.abs(ref - med), axis=0)
            scale = np.maximum.reduce(
                [mad, self.p["rel_scale_floor"] * np.abs(med), np.full(x.shape[1], 1e-3)]
            )
            z[rows] = np.clip((x[rows] - med) / scale, -Z_CLIP, Z_CLIP)
            medians[rows] = med
        return z, medians

    def measure_population(self, profiles: list[EntityProfile]) -> dict[str, Measure]:
        usable = [p for p in profiles if p.months >= self.cfg.min_support]
        if len(usable) < MIN_PEERS:  # too few peers for a meaningful isolation model
            return {}
        names = list(self.explained_by)
        x = np.array([[p.features.get(n, 0.0) for n in names] for p in usable], dtype=float)
        z, medians = self._standardise(x, [p.cohort for p in usable])

        # Neutralise what existing findings already explain.
        explained = np.array(
            [[bool(set(self.explained_by[n]) & p.flagged) for n in names] for p in usable]
        )
        residual = np.where(explained, 0.0, z)

        model = IsolationForest(n_estimators=int(self.p["n_estimators"]), random_state=0)
        model.fit(residual)
        scores = -model.score_samples(residual)  # higher = more isolated

        out: dict[str, Measure] = {}
        for i, p in enumerate(usable):
            order = np.argsort(-np.abs(residual[i]))[: int(self.p["top_features"])]
            drivers = [j for j in order if abs(residual[i, j]) >= self.p["feature_z_min"]]
            texts = [
                f"{FEATURES.get(names[j], names[j]).lower()} is "
                f"{fmt_feature(names[j], x[i, j])} vs a peer median of "
                f"{fmt_feature(names[j], medians[i, j])} ({z[i, j]:+.1f} SD)"
                for j in drivers
            ]
            out[p.code] = Measure(
                value=float(scores[i]),
                support=p.months,
                triggered=len(drivers) >= self.p["min_unexplained"],
                details={
                    "drivers": "; ".join(texts),
                    "cohort": p.cohort,
                    "features": {
                        names[j]: {
                            "value": round(float(x[i, j]), 4),
                            "peer_median": round(float(medians[i, j]), 4),
                            "z": round(float(z[i, j]), 2),
                            "explained": bool(explained[i, j]),
                        }
                        for j in np.argsort(-np.abs(z[i]))[:6]
                    },
                },
                evidence=[Evidence("aggregate", None, t) for t in texts],
            )
        return out

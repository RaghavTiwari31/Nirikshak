"""SOC archetypes planted by the synthetic generator.

Each archetype is a known operational weakness with the signal IDs it should trigger
(see docs/IMPLEMENTATION_PLAN.md §4.3-4.5). The planted truth lets the Validation Lab
measure precision/recall and compare tool-directed review against random sampling.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Archetype:
    key: str
    label: str
    description: str
    planted_signals: tuple[str, ...]
    severity: int  # 0 = healthy .. 4 = most urgent, used as the mock "expert" ranking


ARCHETYPES: dict[str, Archetype] = {
    a.key: a
    for a in [
        Archetype(
            "healthy",
            "Healthy benchmark",
            "Normal operational noise only; used to measure false positives.",
            (),
            0,
        ),
        Archetype(
            "metric_gamer",
            "Metric Gamer",
            "Closures bunched just under the SLA deadline; critical alerts closed within "
            "minutes; declared MTTR far better than reality.",
            ("EG-05", "EG-01", "EG-08"),
            3,
        ),
        Archetype(
            "template_closer",
            "Template Closer",
            "Two analysts close most work with copy-paste notes and no investigation steps.",
            ("EG-04", "EG-03"),
            2,
        ),
        Archetype(
            "silent_blind_spot",
            "Silent Blind Spot",
            "OT estate in inventory but no OT telemetry; domain controllers raise no "
            "authentication alerts; critical servers go silent; a monthly submission is "
            "missing.",
            ("NS-07", "NS-01", "NS-02", "NS-03", "NS-08"),
            4,
        ),
        Archetype(
            "never_escalates",
            "Never Escalates",
            "Critical true positives are closed without any escalation record.",
            ("EG-02", "NS-04"),
            4,
        ),
        Archetype(
            "ghost_night_shift",
            "Ghost Night Shift",
            "Claims 24x7 monitoring, but off-hours alerts wait until the morning shift.",
            ("EG-10", "EG-08"),
            3,
        ),
        Archetype(
            "recurring_wounds",
            "Recurring Wounds",
            "The same assets re-alert every couple of weeks with no root cause or "
            "remediation recorded.",
            ("EG-06",),
            3,
        ),
        Archetype(
            "bulk_closer",
            "Bulk Closer",
            "Weekly batches of alerts closed in the same minute; one tool's alerts are "
            "never looked at by a human.",
            ("EG-09", "EG-12"),
            3,
        ),
        Archetype(
            "decaying_soc",
            "Decaying SOC",
            "Response times, escalation discipline and note quality degrade after month 6, "
            "while the declared MTTR still reflects the good early months.",
            ("TR-01", "EG-08"),
            3,
        ),
        Archetype(
            "holdout_unknown",
            "Hold-out (unknown pattern)",
            "One analyst handles ~90% of all work and escalations only happen on Mondays. "
            "No rule targets this; only the anomaly model can find it.",
            ("AN-01",),
            2,
        ),
    ]
}

# Mix for the default 40-entity dataset: half healthy, half with planted weaknesses.
DEFAULT_MIX: dict[str, int] = {
    "silent_blind_spot": 3,
    "metric_gamer": 3,
    "never_escalates": 2,
    "ghost_night_shift": 2,
    "template_closer": 2,
    "recurring_wounds": 2,
    "bulk_closer": 2,
    "decaying_soc": 2,
    "holdout_unknown": 2,
}


def archetype_plan(n_entities: int) -> list[str]:
    """Archetype keys for n entities: ~half weakened, cycling through every archetype."""
    weakened_target = n_entities // 2
    pool = [k for k, n in DEFAULT_MIX.items() for _ in range(n)]
    if weakened_target <= len(pool):
        # Round-robin so small datasets still cover as many archetypes as possible.
        order = list(DEFAULT_MIX)
        picked: list[str] = []
        counts = dict.fromkeys(order, 0)
        while len(picked) < weakened_target:
            for k in order:
                if len(picked) < weakened_target and counts[k] < DEFAULT_MIX[k]:
                    picked.append(k)
                    counts[k] += 1
    else:
        picked = pool + [pool[i % len(pool)] for i in range(weakened_target - len(pool))]
    return picked + ["healthy"] * (n_entities - len(picked))

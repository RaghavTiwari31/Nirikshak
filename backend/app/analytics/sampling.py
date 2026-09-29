"""Review sample packs: what a supervisor should examine by hand, entity by entity.

Most of each pack is finding-directed (evidence records, allocated to findings in
proportion to their weight). A fixed share is a random control sample of the entity's
alerts. Examiner outcomes on the control sample give an unbiased estimate of the
background problem rate, so the tool's own hit rate can be measured rather than assumed.
"""

from dataclasses import dataclass

import numpy as np

from app.analytics.config import ReviewConfig
from app.analytics.scoring import EntityScoreResult

# Assets are reviewable too: for negative-space findings (silent systems, unmonitored OT)
# the manual check is the asset's monitoring coverage, not any single alert.
REVIEWABLE = ("alert", "case", "asset")


@dataclass
class SampleRow:
    entity_id: int
    record_type: str
    record_id: int
    stratum: str  # "finding:<signal>" or "random_control"
    reason: str


def select_entities(scores: list[EntityScoreResult], cfg: ReviewConfig) -> list[EntityScoreResult]:
    return [
        s for s in scores if s.findings and (s.rank <= cfg.top_entities or s.sai >= cfg.min_sai)
    ]


def _allocate(weights: list[float], total: int) -> list[int]:
    """Largest-remainder split of `total` slots proportional to weights."""
    if not weights or total <= 0:
        return [0] * len(weights)
    raw = np.array(weights) / sum(weights) * total
    alloc = np.floor(raw).astype(int)
    for i in np.argsort(-(raw - alloc))[: total - alloc.sum()]:
        alloc[i] += 1
    return alloc.tolist()


def build_pack(
    score: EntityScoreResult,
    evidence: dict[int, list[tuple[str, int, str]]],
    controls: list[int],
    cfg: ReviewConfig,
) -> list[SampleRow]:
    """evidence: finding id -> [(record_type, record_id, note)]; controls: random alert ids."""
    n_control = round(cfg.pack_size * cfg.control_share)
    n_directed = cfg.pack_size - n_control
    findings = sorted(score.findings, key=lambda f: -f.weight)
    reviewable = {
        f.finding_id: [e for e in evidence.get(f.finding_id, []) if e[0] in REVIEWABLE]
        for f in findings
    }
    findings = [f for f in findings if reviewable[f.finding_id]]

    rows: list[SampleRow] = []
    seen: set[tuple[str, int]] = set()
    for f, k in zip(findings, _allocate([f.weight for f in findings], n_directed), strict=True):
        for rtype, rid, note in reviewable[f.finding_id]:
            if k <= 0:
                break
            if (rtype, rid) in seen:
                continue
            seen.add((rtype, rid))
            rows.append(
                SampleRow(
                    score.entity_id,
                    rtype,
                    rid,
                    f"finding:{f.signal_id}",
                    f"{f.signal_id}: {note}"[:256],
                )
            )
            k -= 1
    # Unused directed slots (not enough evidence) roll over into the control sample.
    n_control += n_directed - len(rows)
    for rid in controls:
        if n_control <= 0:
            break
        if ("alert", rid) in seen:
            continue
        seen.add(("alert", rid))
        rows.append(
            SampleRow(
                score.entity_id,
                "alert",
                rid,
                "random_control",
                "Random control sample (unbiased baseline)",
            )
        )
        n_control -= 1
    return rows

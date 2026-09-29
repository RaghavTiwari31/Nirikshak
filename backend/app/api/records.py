"""Key fields of the evidence records (alerts, cases, assets) that findings and review
samples point to. Identifiers are the pseudonymised values stored at ingestion."""

from collections.abc import Iterable
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

RECORD_SQL = {
    "alert": """
        SELECT a.id, a.source_ref, a.severity, a.category, a.rule_ref, a.source_tool,
               a.disposition, a.created_at, a.acknowledged_at, a.closed_at,
               s.asset_type, s.asset_ref_hash AS asset, c.source_ref AS case_ref
        FROM alert a LEFT JOIN asset s ON s.id = a.asset_id
        LEFT JOIN case_record c ON c.id = a.case_id WHERE a.id = ANY(:ids)""",
    "case": """
        SELECT id, source_ref, priority, status, opened_at, closed_at, escalated,
               escalation_level, left(resolution_note, 300) AS resolution_note, root_cause,
               remediation_action FROM case_record WHERE id = ANY(:ids)""",
    "asset": """
        SELECT id, asset_ref_hash AS asset, asset_type, environment, criticality,
               expected_sources FROM asset WHERE id = ANY(:ids)""",
}


def fetch_records(
    db: Session, refs: Iterable[tuple[str, int | None]]
) -> dict[tuple[str, int], dict[str, Any]]:
    wanted: dict[str, list[int]] = {}
    for rtype, rid in refs:
        if rid is not None and rtype in RECORD_SQL:
            wanted.setdefault(rtype, []).append(rid)
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for rtype, ids in wanted.items():
        for rec in db.execute(text(RECORD_SQL[rtype]), {"ids": ids}).mappings():
            out[(rtype, rec["id"])] = dict(rec)
    return out

"""Bulk loading of validated datasets into Postgres.

Rows are streamed with COPY into a temporary staging table, then merged into the real
table with one INSERT ... SELECT that resolves asset/case references in SQL. This keeps
Python memory flat (important on a 512 MB instance) and makes re-submission idempotent.
"""

import io
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import pandas as pd
import psycopg

from app.ingestion.validate import DatasetReport


@dataclass
class LoadStats:
    rows_written: int = 0
    unresolved: int = 0


def _csv_column(s: pd.Series, kind: str) -> pd.Series:
    """Render one column as COPY-CSV text. Missing values become NULL (unquoted empty)."""
    if kind == "timestamptz":
        # ISO 8601 with offset; sub-microsecond digits are dropped (Postgres keeps µs).
        return s.dt.tz_convert("UTC").dt.strftime("%Y-%m-%dT%H:%M:%S.%f+00:00")
    if kind == "date":
        return s.dt.strftime("%Y-%m-%d")
    if kind == "list":
        return s.map(lambda v: ";".join(v) if isinstance(v, list) and v else None)
    if kind == "bool":
        return s.astype("boolean").map({True: "t", False: "f"})
    return s


def _stage(
    cur: psycopg.Cursor[Any], table: str, columns: Sequence[tuple[str, str]], df: pd.DataFrame
) -> None:
    sql_type = {"list": "text", "int": "int8"}
    defs = ", ".join(f"{name} {sql_type.get(kind, kind)}" for name, kind in columns)
    # Reused across submissions in one transaction (cheaper than drop/create churn).
    cur.execute(
        f"CREATE TEMP TABLE IF NOT EXISTS {table} ({defs}) ON COMMIT DROP; TRUNCATE {table}"
    )
    frame = pd.DataFrame({name: _csv_column(df[name], kind) for name, kind in columns})
    buf = io.StringIO()
    frame.to_csv(buf, header=False, index=False, na_rep="")
    names = ", ".join(name for name, _ in columns)
    with cur.copy(f"COPY {table} ({names}) FROM STDIN WITH (FORMAT csv)") as copy:
        copy.write(buf.getvalue())


def load_assets(cur: psycopg.Cursor[Any], entity_id: int, df: pd.DataFrame) -> LoadStats:
    _stage(
        cur,
        "stg_asset",
        [
            ("asset_ref", "text"),
            ("asset_type", "text"),
            ("environment", "text"),
            ("criticality", "int2"),
            ("expected_sources", "list"),
        ],
        df,
    )
    cur.execute(
        """
        INSERT INTO asset (entity_id, asset_ref_hash, asset_type, environment, criticality,
                           expected_sources)
        SELECT %(e)s, asset_ref, asset_type, environment, criticality,
               COALESCE(string_to_array(expected_sources, ';'), '{}')
        FROM stg_asset
        ON CONFLICT (entity_id, asset_ref_hash) DO UPDATE SET
            asset_type = EXCLUDED.asset_type, environment = EXCLUDED.environment,
            criticality = EXCLUDED.criticality, expected_sources = EXCLUDED.expected_sources
        """,
        {"e": entity_id},
    )
    written = cur.rowcount
    # Alerts that arrived before the inventory can now be linked to their asset.
    cur.execute(
        """
        UPDATE alert SET asset_id = a.id FROM asset a
        WHERE alert.entity_id = %(e)s AND alert.asset_id IS NULL
          AND a.entity_id = %(e)s AND a.asset_ref_hash = alert.asset_ref_hash
        """,
        {"e": entity_id},
    )
    return LoadStats(rows_written=written)


def load_cases(
    cur: psycopg.Cursor[Any], entity_id: int, submission_id: int, df: pd.DataFrame
) -> LoadStats:
    _stage(
        cur,
        "stg_case",
        [
            ("case_ref", "text"),
            ("opened_at", "timestamptz"),
            ("closed_at", "timestamptz"),
            ("priority", "text"),
            ("status", "text"),
            ("assignee", "text"),
            ("escalated", "bool"),
            ("escalation_level", "text"),
            ("resolution_note", "text"),
            ("root_cause", "text"),
            ("remediation_action", "text"),
            ("reopened_count", "int2"),
        ],
        df,
    )
    cur.execute(
        """
        INSERT INTO case_record (entity_id, submission_id, source_ref, opened_at, closed_at,
            priority, status, assignee_hash, escalated, escalation_level, resolution_note,
            root_cause, remediation_action, reopened_count)
        SELECT %(e)s, %(s)s, case_ref, opened_at, closed_at, priority, status, assignee,
               COALESCE(escalated, false), escalation_level, resolution_note, root_cause,
               remediation_action, COALESCE(reopened_count, 0)
        FROM stg_case
        ON CONFLICT (entity_id, source_ref) DO UPDATE SET
            submission_id = EXCLUDED.submission_id, closed_at = EXCLUDED.closed_at,
            priority = EXCLUDED.priority, status = EXCLUDED.status,
            assignee_hash = EXCLUDED.assignee_hash, escalated = EXCLUDED.escalated,
            escalation_level = EXCLUDED.escalation_level,
            resolution_note = EXCLUDED.resolution_note, root_cause = EXCLUDED.root_cause,
            remediation_action = EXCLUDED.remediation_action,
            reopened_count = EXCLUDED.reopened_count
        """,
        {"e": entity_id, "s": submission_id},
    )
    written = cur.rowcount
    cur.execute(
        """
        UPDATE alert SET case_id = c.id FROM case_record c
        WHERE alert.entity_id = %(e)s AND alert.case_id IS NULL AND alert.case_ref IS NOT NULL
          AND c.entity_id = %(e)s AND c.source_ref = alert.case_ref
        """,
        {"e": entity_id},
    )
    return LoadStats(rows_written=written)


def load_alerts(
    cur: psycopg.Cursor[Any],
    entity_id: int,
    submission_id: int,
    df: pd.DataFrame,
    report: DatasetReport,
) -> LoadStats:
    _stage(
        cur,
        "stg_alert",
        [
            ("alert_ref", "text"),
            ("asset_ref", "text"),
            ("source_tool", "text"),
            ("rule_ref", "text"),
            ("category", "text"),
            ("mitre_tactic", "text"),
            ("severity", "text"),
            ("created_at", "timestamptz"),
            ("acknowledged_at", "timestamptz"),
            ("closed_at", "timestamptz"),
            ("disposition", "text"),
            ("case_ref", "text"),
            ("analyst", "text"),
        ],
        df,
    )
    cur.execute(
        """
        SELECT count(*) FILTER (WHERE t.asset_ref IS NOT NULL AND a.id IS NULL),
               count(*) FILTER (WHERE t.case_ref IS NOT NULL AND c.id IS NULL)
        FROM stg_alert t
        LEFT JOIN asset a ON a.entity_id = %(e)s AND a.asset_ref_hash = t.asset_ref
        LEFT JOIN case_record c ON c.entity_id = %(e)s AND c.source_ref = t.case_ref
        """,
        {"e": entity_id},
    )
    unknown_assets, unknown_cases = cur.fetchone() or (0, 0)
    report.warn("asset not in inventory", unknown_assets)
    report.warn("linked case not received yet (links when it arrives)", unknown_cases)
    cur.execute(
        """
        INSERT INTO alert (entity_id, submission_id, source_ref, asset_id, asset_ref_hash,
            case_ref, source_tool, rule_ref, category, mitre_tactic, severity, created_at,
            acknowledged_at, closed_at, disposition, case_id, analyst_hash)
        SELECT %(e)s, %(s)s, t.alert_ref, a.id, t.asset_ref, t.case_ref, t.source_tool,
               t.rule_ref, t.category, t.mitre_tactic, t.severity, t.created_at,
               t.acknowledged_at, t.closed_at, t.disposition, c.id, t.analyst
        FROM stg_alert t
        LEFT JOIN asset a ON a.entity_id = %(e)s AND a.asset_ref_hash = t.asset_ref
        LEFT JOIN case_record c ON c.entity_id = %(e)s AND c.source_ref = t.case_ref
        ON CONFLICT (entity_id, source_ref) DO UPDATE SET
            submission_id = EXCLUDED.submission_id,
            acknowledged_at = EXCLUDED.acknowledged_at, closed_at = EXCLUDED.closed_at,
            disposition = EXCLUDED.disposition, analyst_hash = EXCLUDED.analyst_hash,
            case_ref = COALESCE(EXCLUDED.case_ref, alert.case_ref),
            case_id = COALESCE(EXCLUDED.case_id, alert.case_id)
        """,
        {"e": entity_id, "s": submission_id},
    )
    return LoadStats(rows_written=cur.rowcount, unresolved=unknown_assets)


def _load_case_children(
    cur: psycopg.Cursor[Any],
    entity_id: int,
    df: pd.DataFrame,
    report: DatasetReport,
    staging: str,
    columns: list[tuple[str, str]],
    insert_sql: str,
) -> LoadStats:
    _stage(cur, staging, columns, df)
    cur.execute(
        f"""
        SELECT count(*) FROM {staging} t
        LEFT JOIN case_record c ON c.entity_id = %(e)s AND c.source_ref = t.case_ref
        WHERE c.id IS NULL
        """,
        {"e": entity_id},
    )
    orphans = (cur.fetchone() or (0,))[0]
    report.warn("case not found (row skipped)", orphans)
    cur.execute(insert_sql, {"e": entity_id})
    return LoadStats(rows_written=cur.rowcount, unresolved=orphans)


def load_case_events(
    cur: psycopg.Cursor[Any], entity_id: int, df: pd.DataFrame, report: DatasetReport
) -> LoadStats:
    return _load_case_children(
        cur,
        entity_id,
        df,
        report,
        "stg_case_event",
        [("case_ref", "text"), ("ts", "timestamptz"), ("action", "text"), ("actor", "text")],
        """
        INSERT INTO case_event (case_id, ts, action, actor_hash)
        SELECT c.id, t.ts, t.action, t.actor FROM stg_case_event t
        JOIN case_record c ON c.entity_id = %(e)s AND c.source_ref = t.case_ref
        ON CONFLICT (case_id, ts, action) DO NOTHING
        """,
    )


def load_escalations(
    cur: psycopg.Cursor[Any], entity_id: int, df: pd.DataFrame, report: DatasetReport
) -> LoadStats:
    return _load_case_children(
        cur,
        entity_id,
        df,
        report,
        "stg_escalation",
        [
            ("case_ref", "text"),
            ("ts", "timestamptz"),
            ("from_tier", "text"),
            ("to_tier", "text"),
            ("reason", "text"),
        ],
        """
        INSERT INTO escalation (entity_id, case_id, ts, from_tier, to_tier, reason)
        SELECT %(e)s, c.id, t.ts, t.from_tier, t.to_tier, t.reason FROM stg_escalation t
        JOIN case_record c ON c.entity_id = %(e)s AND c.source_ref = t.case_ref
        ON CONFLICT (case_id, ts, to_tier) DO NOTHING
        """,
    )


def load_source_volume(
    cur: psycopg.Cursor[Any], entity_id: int, df: pd.DataFrame, report: DatasetReport
) -> LoadStats:
    _stage(
        cur,
        "stg_volume",
        [("asset_ref", "text"), ("source_tool", "text"), ("day", "date"), ("event_count", "int8")],
        df,
    )
    cur.execute(
        """
        SELECT count(*) FROM stg_volume t
        LEFT JOIN asset a ON a.entity_id = %(e)s AND a.asset_ref_hash = t.asset_ref
        WHERE a.id IS NULL
        """,
        {"e": entity_id},
    )
    orphans = (cur.fetchone() or (0,))[0]
    report.warn("asset not in inventory (row skipped)", orphans)
    cur.execute(
        """
        INSERT INTO source_volume (entity_id, asset_id, source_tool, day, event_count)
        SELECT %(e)s, a.id, t.source_tool, t.day, t.event_count FROM stg_volume t
        JOIN asset a ON a.entity_id = %(e)s AND a.asset_ref_hash = t.asset_ref
        ON CONFLICT (entity_id, asset_id, source_tool, day) DO UPDATE
            SET event_count = EXCLUDED.event_count
        """,
        {"e": entity_id},
    )
    return LoadStats(rows_written=cur.rowcount, unresolved=orphans)

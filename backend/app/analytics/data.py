"""Data access for an analysis run.

Two levels, so memory stays flat on a 512 MB instance:
  * RunContext: cross-entity aggregates computed in Postgres (window, peer rates).
  * EntityFrame: one entity's evidence for the window, loaded, analysed, then dropped.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy import Connection, text

from app.domain.taxonomy import CATEGORIES


@dataclass
class EntityInfo:
    id: int
    code: str
    display_name: str
    sector: str
    size_tier: str
    declared_24x7: bool
    declared_sla: dict[str, float]
    declared_mttr_hours: float | None
    declared_coverage_pct: float | None


@dataclass
class RunContext:
    window_start: date  # inclusive, local calendar date
    window_end: date  # exclusive
    tz: ZoneInfo
    default_sla: dict[str, float]
    # (entity_id, asset_type) -> alerts per asset per day
    type_rates: dict[tuple[int, str], float] = field(default_factory=dict)
    # (entity_id, asset_type, category) -> alerts per asset per day
    cell_rates: dict[tuple[int, str, str], float] = field(default_factory=dict)
    # (entity_id, asset_type) -> asset count
    asset_counts: dict[tuple[int, str], int] = field(default_factory=dict)

    @property
    def start_ts(self) -> datetime:
        return datetime.combine(self.window_start, datetime.min.time(), self.tz)

    @property
    def end_ts(self) -> datetime:
        return datetime.combine(self.window_end, datetime.min.time(), self.tz)

    @property
    def days(self) -> int:
        return (self.window_end - self.window_start).days

    @property
    def months(self) -> list[date]:
        out, d = [], self.window_start.replace(day=1)
        while d < self.window_end:
            out.append(d)
            d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
        return out

    def peer_rate(
        self, entity_id: int, asset_type: str, category: str | None = None, min_peers: int = 3
    ) -> float | None:
        """Leave-one-out median rate among other entities that have this asset type."""
        rates = []
        for (e, t), n in self.asset_counts.items():
            if e == entity_id or t != asset_type or n == 0:
                continue
            if category is None:
                rates.append(self.type_rates.get((e, t), 0.0))
            else:
                rates.append(self.cell_rates.get((e, t, category), 0.0))
        if len(rates) < min_peers:
            return None
        return float(pd.Series(rates).median())


def default_window(conn: Connection) -> tuple[date, date] | None:
    row = conn.execute(
        text("SELECT min(period_start), max(period_end) FROM submission WHERE status <> 'rejected'")
    ).one()
    if row[0] is None:
        return None
    return row[0], row[1] + timedelta(days=1)


def build_context(
    conn: Connection, window: tuple[date, date], tz: str, default_sla: dict[str, float]
) -> RunContext:
    ctx = RunContext(window[0], window[1], ZoneInfo(tz), default_sla)
    for e, t, n in conn.execute(
        text("SELECT entity_id, asset_type, count(*) FROM asset GROUP BY 1, 2")
    ):
        ctx.asset_counts[(e, t)] = n
    days = max(ctx.days, 1)
    params = {"s": ctx.start_ts, "e": ctx.end_ts}
    for e, t, c, n in conn.execute(
        text(
            """
        SELECT a.entity_id, s.asset_type, a.category, count(*)
        FROM alert a JOIN asset s ON s.id = a.asset_id
        WHERE a.created_at >= :s AND a.created_at < :e
        GROUP BY 1, 2, 3
        """
        ),
        params,
    ):
        n_assets = ctx.asset_counts.get((e, t), 0)
        if n_assets:
            ctx.cell_rates[(e, t, c)] = n / n_assets / days
            ctx.type_rates[(e, t)] = ctx.type_rates.get((e, t), 0.0) + n / n_assets / days
    return ctx


def list_entities(conn: Connection) -> list[EntityInfo]:
    rows = conn.execute(
        text(
            """
        SELECT id, code, display_name, sector, size_tier, declared_24x7, declared_sla_json,
               declared_mttr_hours, declared_coverage_pct
        FROM entity e
        WHERE EXISTS (SELECT 1 FROM submission s WHERE s.entity_id = e.id)
        ORDER BY code
        """
        )
    )
    return [
        EntityInfo(r[0], r[1], r[2], r[3], r[4], bool(r[5]), dict(r[6] or {}), r[7], r[8])
        for r in rows
    ]


@dataclass
class EntityFrame:
    info: EntityInfo
    alerts: pd.DataFrame
    cases: pd.DataFrame
    escalations: pd.DataFrame
    assets: pd.DataFrame
    volume: pd.DataFrame
    submissions: pd.DataFrame
    # Monthly feature vectors (month start -> features); filled in by the runner.
    features: dict[date, dict[str, float]] = field(default_factory=dict)

    @property
    def closed_alerts(self) -> pd.DataFrame:
        return self.alerts[self.alerts.closed_at.notna()]


def _read(
    conn: Connection, sql: str, params: dict[str, Any], dates: tuple[str, ...] = ()
) -> pd.DataFrame:
    df = pd.read_sql(text(sql), conn, params=params)
    for col in dates:
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


def enrich_alerts(alerts: pd.DataFrame, tz: ZoneInfo) -> pd.DataFrame:
    """Derived columns every signal relies on: hours to close, minutes to ack, local hour."""
    alerts = alerts.copy()
    alerts["ttc_h"] = (alerts.closed_at - alerts.created_at).dt.total_seconds() / 3600
    alerts["ack_min"] = (alerts.acknowledged_at - alerts.created_at).dt.total_seconds() / 60
    alerts["local_hour"] = alerts.created_at.dt.tz_convert(tz).dt.hour
    return alerts


def load_entity(conn: Connection, info: EntityInfo, ctx: RunContext) -> EntityFrame:
    p = {"e": info.id, "s": ctx.start_ts, "t": ctx.end_ts}
    alerts = _read(
        conn,
        """
        SELECT id, asset_id, source_tool, rule_ref, category, severity, created_at,
               acknowledged_at, closed_at, disposition, case_id, analyst_hash
        FROM alert WHERE entity_id = :e AND created_at >= :s AND created_at < :t
        """,
        p,
        ("created_at", "acknowledged_at", "closed_at"),
    )
    alerts = enrich_alerts(alerts, ctx.tz)

    cases = _read(
        conn,
        """
        SELECT c.id, c.opened_at, c.closed_at, c.priority, c.status, c.assignee_hash,
               c.escalated, c.escalation_level, c.resolution_note, c.root_cause,
               c.remediation_action, c.reopened_count,
               coalesce(ev.comments, 0) AS n_comment, coalesce(ev.contains, 0) AS n_contain,
               coalesce(es.n, 0) AS n_escalations,
               coalesce(al.tp, false) AS is_tp
        FROM case_record c
        LEFT JOIN (SELECT ce.case_id,
                          count(*) FILTER (WHERE ce.action = 'comment') AS comments,
                          count(*) FILTER (WHERE ce.action = 'contain') AS contains
                   FROM case_event ce JOIN case_record cc ON cc.id = ce.case_id
                   WHERE cc.entity_id = :e GROUP BY ce.case_id) ev ON ev.case_id = c.id
        LEFT JOIN (SELECT case_id, count(*) AS n FROM escalation WHERE entity_id = :e
                   GROUP BY case_id) es ON es.case_id = c.id
        LEFT JOIN (SELECT case_id, bool_or(disposition = 'tp') AS tp FROM alert
                   WHERE entity_id = :e GROUP BY case_id) al ON al.case_id = c.id
        WHERE c.entity_id = :e AND c.opened_at >= :s AND c.opened_at < :t
        """,
        p,
        ("opened_at", "closed_at"),
    )

    escalations = _read(
        conn,
        """
        SELECT case_id, to_tier, ts FROM escalation
        WHERE entity_id = :e AND ts >= :s AND ts < :t
        """,
        p,
        ("ts",),
    )
    assets = _read(
        conn,
        """
        SELECT id, asset_type, environment, criticality, expected_sources
        FROM asset WHERE entity_id = :e
        """,
        p,
    )
    volume = _read(
        conn,
        """
        SELECT asset_id, source_tool, day, event_count FROM source_volume
        WHERE entity_id = :e AND day >= CAST(:ds AS date) AND day < CAST(:de AS date)
        """,
        {**p, "ds": ctx.window_start, "de": ctx.window_end},
    )
    submissions = _read(
        conn,
        """
        SELECT id, period_start, period_end, status FROM submission WHERE entity_id = :e
        """,
        p,
    )
    return EntityFrame(info, alerts, cases, escalations, assets, volume, submissions)


def category_label(key: str) -> str:
    cat = CATEGORIES.get(key)
    return cat.label if cat else key.replace("_", " ")

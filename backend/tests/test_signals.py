"""Every signal on small hand-built fixtures: one case that must fire, one that must not."""

from datetime import date, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from app.analytics.config import load_config
from app.analytics.data import EntityFrame, EntityInfo, RunContext, enrich_alerts
from app.analytics.signals import REGISTRY
from app.analytics.signals.base import Measure
from app.analytics.stats import baseline

TZ = ZoneInfo("Asia/Kolkata")
START, END = date(2026, 1, 1), date(2026, 4, 1)
T0 = pd.Timestamp("2026-01-05 11:00", tz=TZ)  # a weekday morning

ALERT_COLS = [
    "id",
    "asset_id",
    "source_tool",
    "rule_ref",
    "category",
    "severity",
    "created_at",
    "acknowledged_at",
    "closed_at",
    "disposition",
    "case_id",
    "analyst_hash",
]
CASE_COLS = [
    "id",
    "opened_at",
    "closed_at",
    "priority",
    "status",
    "assignee_hash",
    "escalated",
    "escalation_level",
    "resolution_note",
    "root_cause",
    "remediation_action",
    "reopened_count",
    "n_comment",
    "n_contain",
    "n_escalations",
    "is_tp",
]


def ctx(**kw: Any) -> RunContext:
    c = RunContext(START, END, TZ, dict(load_config().default_sla_hours))
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def info(**kw: Any) -> EntityInfo:
    base = dict(
        id=1,
        code="CSE-T-01",
        display_name="Test",
        sector="bfsi",
        size_tier="small",
        declared_24x7=False,
        declared_sla={},
        declared_mttr_hours=None,
        declared_coverage_pct=None,
    )
    return EntityInfo(**{**base, **kw})


def alert(
    i: int,
    *,
    minutes_to_close: float | None = 60,
    ack_minutes: float | None = 5,
    created: pd.Timestamp = T0,
    **kw: Any,
) -> dict[str, Any]:
    row = dict(
        id=i,
        asset_id=1,
        source_tool="edr",
        rule_ref="r1",
        category="malware",
        severity="high",
        created_at=created,
        acknowledged_at=None
        if ack_minutes is None
        else created + pd.Timedelta(minutes=ack_minutes),
        closed_at=None
        if minutes_to_close is None
        else created + pd.Timedelta(minutes=minutes_to_close),
        disposition="fp",
        case_id=None,
        analyst_hash="an1",
    )
    row.update(kw)
    return row


def case(i: int, **kw: Any) -> dict[str, Any]:
    row = dict(
        id=i,
        opened_at=T0,
        closed_at=T0 + pd.Timedelta(hours=2),
        priority="high",
        status="closed",
        assignee_hash="an1",
        escalated=False,
        escalation_level=None,
        resolution_note="Investigated the activity in depth; confirmed benign admin task.",
        root_cause="authorised admin activity",
        remediation_action=None,
        reopened_count=0,
        n_comment=2,
        n_contain=0,
        n_escalations=0,
        is_tp=False,
    )
    row.update(kw)
    return row


def frame(
    alerts: list[dict[str, Any]] | None = None,
    cases: list[dict[str, Any]] | None = None,
    assets: list[dict[str, Any]] | None = None,
    volume: pd.DataFrame | None = None,
    submissions: list[dict[str, Any]] | None = None,
    **info_kw: Any,
) -> EntityFrame:
    a = pd.DataFrame(alerts or [], columns=ALERT_COLS)
    for col in ("created_at", "acknowledged_at", "closed_at"):
        a[col] = pd.to_datetime(a[col], utc=True)
    c = pd.DataFrame(cases or [], columns=CASE_COLS)
    for col in ("opened_at", "closed_at"):
        c[col] = pd.to_datetime(c[col], utc=True)
    return EntityFrame(
        info=info(**info_kw),
        alerts=enrich_alerts(a, TZ),
        cases=c,
        escalations=pd.DataFrame(columns=["case_id", "to_tier", "ts"]),
        assets=pd.DataFrame(
            assets
            or [
                {
                    "id": 1,
                    "asset_type": "server",
                    "environment": "it",
                    "criticality": 3,
                    "expected_sources": ["edr"],
                }
            ]
        ),
        volume=volume
        if volume is not None
        else pd.DataFrame(columns=["asset_id", "source_tool", "day", "event_count"]),
        submissions=pd.DataFrame(
            submissions or [], columns=["id", "period_start", "period_end", "status"]
        ),
    )


def measure(signal_id: str, f: EntityFrame, c: RunContext | None = None) -> Measure:
    return REGISTRY[signal_id](load_config().signal(signal_id), c or ctx()).measure(f)


def test_every_configured_signal_is_implemented() -> None:
    assert {s.id for s in load_config().signals} == set(REGISTRY)


# ------------------------------------------------------------------ execution gaps
def test_eg01_rapid_closure() -> None:
    fast = frame([alert(i, minutes_to_close=4, ack_minutes=1) for i in range(25)])
    m = measure("EG-01", fast)
    assert m.triggered and m.value == 1.0 and m.support == 25 and len(m.evidence) == 25
    slow = frame([alert(i, minutes_to_close=180) for i in range(25)])
    assert not measure("EG-01", slow).triggered
    # Auto-closed alerts nobody touched are not "analyst closed too fast" (that is EG-12).
    auto = frame(
        [alert(i, minutes_to_close=1, ack_minutes=None, analyst_hash=None) for i in range(25)]
    )
    assert measure("EG-01", auto).support == 0


def test_eg02_critical_without_escalation() -> None:
    alerts = [alert(i, severity="critical", disposition="tp", case_id=i) for i in range(6)]
    silent = frame(alerts, [case(i, is_tp=True, priority="critical") for i in range(6)])
    assert measure("EG-02", silent).value == 1.0
    escalated = frame(alerts, [case(i, is_tp=True, n_escalations=1) for i in range(6)])
    assert measure("EG-02", escalated).value == 0.0


def test_eg03_no_investigation() -> None:
    lazy = frame(cases=[case(i, n_comment=0, resolution_note="ok") for i in range(40)])
    assert measure("EG-03", lazy).triggered
    assert not measure("EG-03", frame(cases=[case(i) for i in range(40)])).triggered


def test_eg04_template_notes() -> None:
    same = frame(
        cases=[
            case(i, resolution_note="Checked. No issue found. Closed.", assignee_hash="an9")
            for i in range(40)
        ]
    )
    m = measure("EG-04", same)
    assert m.triggered and m.value == 1.0 and m.details["top_analyst_share"] == 1.0
    varied = frame(
        cases=[
            case(
                i,
                resolution_note=f"Host srv-{i:03d} contacted {i * 7919 % 997} "
                f"unusual endpoints; traced to job {i**3} by user u{i}.",
            )
            for i in range(40)
        ]
    )
    assert not measure("EG-04", varied).triggered


def test_eg05_sla_bunching() -> None:
    # High-severity SLA is 8 h: 120 closures at ~7.6 h, almost none just after 8 h.
    gamed = frame([alert(i, minutes_to_close=456 + i % 20) for i in range(120)])
    m = measure("EG-05", gamed)
    assert m.triggered and m.details["below"] == 120 and m.details["p_value"] < 1e-6
    smooth = frame([alert(i, minutes_to_close=300 + i * 3) for i in range(120)])
    assert not measure("EG-05", smooth).triggered


def test_eg06_recurring_without_remediation() -> None:
    alerts, cases = [], []
    for asset in range(3):
        for k in range(5):
            i = asset * 10 + k
            alerts.append(
                alert(
                    i,
                    asset_id=asset,
                    disposition="tp",
                    case_id=i,
                    created=T0 + pd.Timedelta(days=12 * k),
                )
            )
            cases.append(case(i, root_cause=None, remediation_action=None, is_tp=True))
    m = measure("EG-06", frame(alerts, cases))
    assert m.triggered and m.value == 3 and m.details["repeats"] == 15
    fixed = [dict(c, root_cause="patched later", remediation_action="patch applied") for c in cases]
    assert not measure("EG-06", frame(alerts, fixed)).triggered


def test_eg07_true_positive_rate() -> None:
    f = frame([alert(i, disposition="tp" if i < 5 else "fp") for i in range(60)])
    assert measure("EG-07", f).value == pytest.approx(5 / 60)


def test_eg08_declared_vs_observed() -> None:
    f = frame([alert(i, minutes_to_close=300) for i in range(60)], declared_mttr_hours=1.0)
    m = measure("EG-08", f)
    assert m.triggered and m.value == pytest.approx(5.0) and "5.0x" in m.details["claims"]
    honest = frame([alert(i, minutes_to_close=60) for i in range(60)], declared_mttr_hours=1.0)
    assert not measure("EG-08", honest).triggered


def test_eg09_bulk_closure() -> None:
    batch_time = T0 + pd.Timedelta(days=4)
    batch = [alert(i, closed_at=batch_time + pd.Timedelta(seconds=i)) for i in range(15)]
    normal = [alert(100 + i, minutes_to_close=30 + 97 * i) for i in range(60)]
    m = measure("EG-09", frame(batch + normal))
    assert m.triggered and m.details["batches"] == 1 and m.details["count"] == 15
    assert not measure("EG-09", frame(normal)).triggered


def _night_day(night_ack: float) -> list[dict[str, Any]]:
    night = [
        alert(i, created=T0.normalize() + pd.Timedelta(hours=2, days=i), ack_minutes=night_ack)
        for i in range(40)
    ]
    day = [alert(100 + i, created=T0 + pd.Timedelta(days=i), ack_minutes=10) for i in range(40)]
    return night + day


def test_eg10_night_shift_gap() -> None:
    m = measure("EG-10", frame(_night_day(420), declared_24x7=True))
    assert m.triggered and m.value == pytest.approx(42)
    assert not measure("EG-10", frame(_night_day(14), declared_24x7=True)).triggered
    assert measure("EG-10", frame(_night_day(420), declared_24x7=False)).value is None


def test_eg11_reopens() -> None:
    f = frame(cases=[case(i, reopened_count=1 if i < 10 else 0) for i in range(60)])
    assert measure("EG-11", f).triggered
    assert not measure("EG-11", frame(cases=[case(i) for i in range(60)])).triggered


def test_eg12_unmonitored_tool() -> None:
    ids_alerts = [
        alert(i, source_tool="ids", ack_minutes=None, analyst_hash=None, minutes_to_close=0.1)
        for i in range(60)
    ]
    edr_alerts = [alert(100 + i) for i in range(60)]
    m = measure("EG-12", frame(ids_alerts + edr_alerts))
    assert m.triggered and m.details["tools"] == "IDS" and m.details["count"] == 60
    assert not measure("EG-12", frame(edr_alerts)).triggered


# ------------------------------------------------------------------ negative space
def _peer_ctx() -> RunContext:
    # Three peers (entities 2-4) with servers raising 0.2 alerts/day and DCs raising
    # authentication alerts at 0.5/day.
    counts, types, cells = {}, {}, {}
    for e in (2, 3, 4):
        counts[(e, "server")] = 10
        counts[(e, "dc")] = 2
        types[(e, "server")] = 0.2
        types[(e, "dc")] = 0.5
        cells[(e, "dc", "auth_anomaly")] = 0.5
        cells[(e, "server", "malware")] = 0.2
    return ctx(
        asset_counts=counts | {(1, "server"): 5, (1, "dc"): 2}, type_rates=types, cell_rates=cells
    )


SERVERS = [
    {
        "id": i,
        "asset_type": "server",
        "environment": "it",
        "criticality": 4,
        "expected_sources": ["edr"],
    }
    for i in range(1, 6)
]
DCS = [
    {
        "id": 10 + i,
        "asset_type": "dc",
        "environment": "it",
        "criticality": 4,
        "expected_sources": ["siem"],
    }
    for i in range(2)
]


def test_ns01_silent_critical_assets() -> None:
    dc_alerts = [alert(i, asset_id=10 + i % 2) for i in range(60)]  # both DCs are busy
    silent = frame(dc_alerts, assets=SERVERS + DCS)
    m = measure("NS-01", silent, _peer_ctx())
    assert m.triggered and m.details["silent"] == 5  # all five servers, ~18 expected each
    busy = [alert(i * 100 + k, asset_id=i) for i in range(1, 6) for k in range(20)]
    busy += dc_alerts
    assert not measure("NS-01", frame(busy, assets=SERVERS + DCS), _peer_ctx()).triggered


def test_ns02_missing_expected_category() -> None:
    no_auth = [alert(i, asset_id=1 + i % 5, category="malware") for i in range(90)]
    m = measure("NS-02", frame(no_auth, assets=SERVERS + DCS), _peer_ctx())
    assert m.triggered and "Anomalous authentication on domain controllers" in m.details["cells"]
    assert any(c["category"] == "auth_anomaly" for c in m.details["matrix"])
    with_auth = no_auth + [alert(500 + i, asset_id=10, category="auth_anomaly") for i in range(80)]
    assert not measure("NS-02", frame(with_auth, assets=SERVERS + DCS), _peer_ctx()).triggered


def test_ns03_telemetry_silence() -> None:
    days = [START + timedelta(days=d) for d in range(30)]
    counts = [100] * 10 + [0] * 12 + [100] * 8
    vol = pd.DataFrame({"asset_id": 1, "source_tool": "siem", "day": days, "event_count": counts})
    jan = [
        {
            "id": 1,
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 1, 31),
            "status": "accepted",
        }
    ]
    m = measure("NS-03", frame(volume=vol, submissions=jan))
    assert m.triggered and m.details["longest"] == 12
    healthy = vol.assign(event_count=[100] * 30)
    assert not measure("NS-03", frame(volume=healthy, submissions=jan)).triggered
    # Without an accepted submission for the month, silence is not judged (NS-08's job).
    assert not measure("NS-03", frame(volume=vol)).triggered


def test_ns04_no_escalations() -> None:
    serious = [case(i, priority="critical", is_tp=True) for i in range(12)]
    assert measure("NS-04", frame(cases=serious)).triggered
    escalated = [dict(c, n_escalations=1) for c in serious]
    assert not measure("NS-04", frame(cases=escalated)).triggered


def test_ns05_orphan_true_positives() -> None:
    orphans = frame([alert(i, disposition="tp", severity="medium") for i in range(25)])
    assert measure("NS-05", orphans).value == 1.0
    linked = frame([alert(i, disposition="tp", severity="medium", case_id=i) for i in range(25)])
    assert not measure("NS-05", linked).triggered


def test_ns06_low_activity_uses_log_scale() -> None:
    m = measure("NS-06", frame([alert(i) for i in range(30)]))
    assert m.value == pytest.approx(30 / 1 / 3)
    assert m.peer_value == pytest.approx(2.302585, rel=1e-4)


def test_ns07_ot_blind_spot() -> None:
    ot = [
        {
            "id": 50 + i,
            "asset_type": "ot_scada",
            "environment": "ot",
            "criticality": 4,
            "expected_sources": ["ot_ids"],
        }
        for i in range(4)
    ]
    assert measure("NS-07", frame([alert(1)], assets=ot)).triggered
    watched = frame([alert(1, source_tool="ot_ids", asset_id=50)], assets=ot)
    assert not measure("NS-07", watched).triggered
    assert measure("NS-07", frame([alert(1)])).value is None  # no OT estate at all


def test_ns08_missing_submission_month() -> None:
    subs = [
        {
            "id": 1,
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 1, 31),
            "status": "accepted",
        },
        {
            "id": 2,
            "period_start": date(2026, 2, 1),
            "period_end": date(2026, 2, 28),
            "status": "rejected",
        },
        {
            "id": 3,
            "period_start": date(2026, 3, 1),
            "period_end": date(2026, 3, 31),
            "status": "accepted_with_warnings",
        },
    ]
    m = measure("NS-08", frame(submissions=subs))
    assert m.triggered and m.details["months"] == "Feb 2026"


# ------------------------------------------------------------------ judging
def test_judge_combines_absolute_rule_and_peer_test() -> None:
    cfg = load_config().signal("EG-01")
    sig = REGISTRY["EG-01"](cfg, ctx())
    peers = baseline({f"e{i}": 0.01 * (i % 3) for i in range(30)}, cfg.min_scale)
    strong = Measure(value=0.4, support=200, triggered=True)
    v = sig.judge(strong, peers)
    assert v is not None and v.severity == 4 and 0.5 <= v.confidence <= 0.97
    # Absolute rule met but not unusual among peers: no finding.
    assert (
        sig.judge(
            Measure(value=0.09, support=200, triggered=True),
            baseline({f"e{i}": 0.09 for i in range(30)}, cfg.min_scale),
        )
        is None
    )
    # Too little evidence to judge.
    assert sig.judge(Measure(value=0.9, support=3, triggered=True), peers) is None

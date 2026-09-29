"""The generator must actually plant what the archetypes claim."""

from datetime import date

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Alert, Entity, Submission, SyntheticTruth
from app.synth.archetypes import ARCHETYPES, archetype_plan
from app.synth.generator import (
    IST,
    SLA_HOURS,
    EntityData,
    EntityGenerator,
    EntitySpec,
    entity_specs,
)
from app.synth.runner import generate

START = date(2025, 9, 1)


def _gen(
    archetype: str, sector: str = "power_energy", months: int = 4, size: str = "medium"
) -> EntityData:
    spec = EntitySpec(
        code="CSE-X-01",
        display_name="X (synthetic)",
        sector=sector,
        size_tier=size,
        soc_model="inhouse",
        archetype=archetype,
        intensity=1.0,
        seed=42,
    )
    return EntityGenerator(spec, START, months).generate()


@pytest.fixture(scope="module")
def healthy() -> EntityData:
    return _gen("healthy")


def _hours_to_close(d: EntityData) -> pd.Series:
    a = d.alerts[d.alerts.closed_at.notna()]
    return (a.closed_at - a.created_at).dt.total_seconds() / 3600


def test_deterministic_for_same_seed() -> None:
    a, b = _gen("healthy", months=2), _gen("healthy", months=2)
    pd.testing.assert_frame_equal(a.alerts, b.alerts)


def test_plan_covers_every_archetype_at_default_size() -> None:
    plan = archetype_plan(40)
    assert plan.count("healthy") == 20
    assert set(plan) == set(ARCHETYPES)
    specs = entity_specs(40, 2026)
    assert len({s.code for s in specs}) == 40
    blind = [s for s in specs if s.archetype == "silent_blind_spot"]
    assert all(s.sector in ("power_energy", "transport", "strategic_public") for s in blind)


def test_metric_gamer_bunches_under_sla(healthy: EntityData) -> None:
    def bunch_ratio(d: EntityData) -> float:
        a = d.alerts[d.alerts.closed_at.notna()]
        sla = a.severity.map(SLA_HOURS)
        frac = ((a.closed_at - a.created_at).dt.total_seconds() / 3600) / sla
        below = ((frac >= 0.85) & (frac < 1.0)).sum()
        above = ((frac >= 1.0) & (frac < 1.15)).sum()
        return below / max(above, 1)

    gamer = _gen("metric_gamer")
    assert bunch_ratio(gamer) > 5 * bunch_ratio(healthy)
    assert gamer.profile["declared_mttr_hours"] < _hours_to_close(gamer).mean() * 0.6


def test_silent_blind_spot_has_no_ot_or_dc_auth_telemetry() -> None:
    d = _gen("silent_blind_spot")
    ot_assets = set(d.assets.asset_ref[d.assets.asset_type.isin(["ot_scada", "ot_hmi"])])
    assert ot_assets, "OT sector should have OT assets"
    assert not d.alerts.asset_ref.isin(ot_assets).any()
    dcs = set(d.assets.asset_ref[d.assets.asset_type == "dc"])
    dc_alerts = d.alerts[d.alerts.asset_ref.isin(dcs)]
    assert not dc_alerts.category.str.startswith("auth").any()
    assert not d.source_volume.asset_ref.isin(ot_assets).any()
    assert d.skipped_months and "NS-07" in d.planted_signals


def test_never_escalates_and_healthy_escalates(healthy: EntityData) -> None:
    assert len(_gen("never_escalates").escalations) == 0
    assert len(healthy.escalations) > 0
    assert (healthy.escalations.to_tier == "cert_in").any()


def test_ghost_night_shift_waits_for_morning() -> None:
    d = _gen("ghost_night_shift")
    assert d.profile["declared_24x7"] is True
    a = d.alerts[d.alerts.acknowledged_at.notna()]
    night = a[a.created_at.dt.tz_convert(IST).dt.hour.isin([1, 2, 3])]
    wait_h = (night.acknowledged_at - night.created_at).dt.total_seconds() / 3600
    assert wait_h.median() > 4


def test_bulk_closer_batches_and_unmonitored_tool() -> None:
    d = _gen("bulk_closer")
    closed = d.alerts.closed_at.dropna().dt.floor("min")
    assert closed.value_counts().max() >= 20
    ids = d.alerts[d.alerts.source_tool == "ids"]
    assert len(ids) and ids.acknowledged_at.isna().all() and ids.analyst.isna().all()


def test_template_closer_notes_are_repetitive(healthy: EntityData) -> None:
    d = _gen("template_closer")
    share = d.cases.resolution_note.value_counts(normalize=True).head(3).sum()
    healthy_share = healthy.cases.resolution_note.value_counts(normalize=True).head(3).sum()
    assert share > 0.4 and healthy_share < 0.05


def test_recurring_wounds_lack_root_cause() -> None:
    d = _gen("recurring_wounds")
    rec = d.alerts[d.alerts.h_recurring]
    assert rec.groupby("asset_ref").size().min() >= 5
    rec_cases = d.cases[d.cases.case_ref.isin(rec.case_ref.dropna())]
    assert rec_cases.root_cause.isna().all() and rec_cases.remediation_action.isna().all()


def test_holdout_concentrates_on_one_analyst_and_mondays() -> None:
    d = _gen("holdout_unknown")
    share = d.alerts.analyst.value_counts(normalize=True).iloc[0]
    assert share > 0.8
    if len(d.escalations):
        assert (d.escalations.ts.dt.tz_convert(IST).dt.weekday == 0).mean() > 0.5


def test_decaying_soc_gets_slower() -> None:
    d = _gen("decaying_soc", months=10)
    a = d.alerts[d.alerts.closed_at.notna()]
    ttc = (a.closed_at - a.created_at).dt.total_seconds()
    early = ttc[a.h_month < 4].median()
    late = ttc[a.h_month >= 8].median()
    assert late > 1.5 * early


def test_timestamps_are_consistent(healthy: EntityData) -> None:
    a = healthy.alerts
    both = a.acknowledged_at.notna() & a.closed_at.notna()
    assert (a.closed_at[both] >= a.acknowledged_at[both]).all()
    assert (a.acknowledged_at.dropna() >= a.created_at[a.acknowledged_at.notna()]).all()
    assert np.isin(a.severity.unique(), ["low", "medium", "high", "critical"]).all()


def test_generate_loads_through_pipeline(db: Session) -> None:
    summary = generate(db, n_entities=3, months=2, seed=5, start=START)
    assert summary.entities == 3 and summary.submissions >= 5
    assert db.scalar(select(func.count()).select_from(Entity)) == 3
    assert db.scalar(select(func.count()).select_from(SyntheticTruth)) == 3
    assert db.scalar(select(func.count()).select_from(Alert)) == summary.rows["alerts"]
    # Clean synthetic data raises no DQ issues except cross-month case links, which are real:
    # an alert on the 30th can belong to a case opened on the 1st (next submission).
    allowed = {"linked case not received yet (links when it arrives)"}
    for sub in db.scalars(select(Submission)):
        for ds in sub.dq_report_json["datasets"]:
            assert not ds["errors"], ds
            assert set(ds["warnings"]) <= allowed, ds["warnings"]
    orphans = db.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.case_ref.is_not(None), Alert.case_id.is_(None))
    )
    assert orphans == 0, "cross-month links must resolve once the later submission arrives"

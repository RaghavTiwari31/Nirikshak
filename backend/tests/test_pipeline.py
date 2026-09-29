"""End-to-end ingestion into Postgres."""

from datetime import date

import pandas as pd
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.pseudonymize import pseudonymize
from app.ingestion.pipeline import IngestError, ingest_bundle, upsert_entity_profiles
from app.models import Alert, Asset, CaseEvent, CaseRecord, Escalation, SourceVolume, Submission

JAN = (date(2026, 1, 1), date(2026, 1, 31))


def _profile(db: Session) -> None:
    upsert_entity_profiles(
        db,
        pd.DataFrame(
            [
                {
                    "entity_code": "CSE-T-01",
                    "display_name": "Test Utility",
                    "sector": "power_energy",
                    "size_tier": "small",
                    "soc_model": "inhouse",
                    "declared_24x7": "yes",
                    "declared_sla_hours_critical": "4",
                    "declared_mttr_hours": "6.5",
                }
            ]
        ),
    )
    db.commit()


def _frames() -> dict[str, pd.DataFrame]:
    return {
        "assets": pd.DataFrame(
            {
                "asset_ref": ["DC-01", "SRV-01"],
                "asset_type": ["dc", "server"],
                "environment": ["it", "it"],
                "criticality": [4, 3],
                "expected_sources": ["siem;edr", "edr"],
            }
        ),
        "cases": pd.DataFrame(
            {
                "case_ref": ["C1"],
                "opened_at": ["2026-01-10T10:05:00Z"],
                "closed_at": ["2026-01-10T12:00:00Z"],
                "priority": ["critical"],
                "status": ["closed"],
                "assignee": ["Asha Rao"],
                "escalation_level": ["l2"],
                "resolution_note": ["Investigated and contained."],
            }
        ),
        "alerts": pd.DataFrame(
            {
                "alert_ref": ["A1", "A2", "A3"],
                "asset_ref": ["DC-01", "SRV-01", "GHOST-9"],
                "source_tool": ["siem", "edr", "edr"],
                "rule_ref": ["r1", "r2", "r3"],
                "category": ["auth_anomaly", "malware", "malware"],
                "severity": ["critical", "low", "medium"],
                "created_at": ["2026-01-10T10:00:00Z", "2026-01-11 09:00", "2026-01-12T00:00:00Z"],
                "closed_at": ["2026-01-10T12:00:00Z", "", ""],
                "disposition": ["tp", "", ""],
                "case_ref": ["C1", "", ""],
                "analyst": ["Asha Rao", "", ""],
            }
        ),
        "case_events": pd.DataFrame(
            {
                "case_ref": ["C1", "C1", "C404"],
                "ts": ["2026-01-10T10:06:00Z", "2026-01-10T12:00:00Z", "2026-01-10T12:00:00Z"],
                "action": ["assign", "close", "close"],
                "actor": ["Asha Rao"] * 3,
            }
        ),
        "escalations": pd.DataFrame(
            {
                "case_ref": ["C1"],
                "ts": ["2026-01-10T10:30:00Z"],
                "from_tier": ["l1"],
                "to_tier": ["l2"],
            }
        ),
        "source_volume": pd.DataFrame(
            {
                "asset_ref": ["DC-01", "DC-01"],
                "source_tool": ["siem", "siem"],
                "day": ["2026-01-10", "2026-01-11"],
                "event_count": [100, 0],
            }
        ),
    }


def _ingest(db: Session, frames: dict[str, pd.DataFrame]) -> Submission:
    sub = ingest_bundle(
        db,
        entity_code="CSE-T-01",
        period_start=JAN[0],
        period_end=JAN[1],
        frames=frames,
        source_format="csv",
        actor="test",
    )
    db.commit()
    return sub


def test_full_bundle_loads_links_and_pseudonymises(db: Session) -> None:
    _profile(db)
    sub = _ingest(db, _frames())
    assert sub.status == "accepted_with_warnings"
    assert sub.row_counts_json == {
        "assets": 2,
        "cases": 1,
        "alerts": 3,
        "case_events": 2,
        "escalations": 1,
        "source_volume": 2,
    }
    warnings = {d["dataset"]: d["warnings"] for d in sub.dq_report_json["datasets"]}
    assert warnings["alerts"]["asset not in inventory"] == 1
    assert warnings["case_events"]["case not found (row skipped)"] == 1

    a1 = db.scalar(select(Alert).where(Alert.source_ref == "A1"))
    assert a1 is not None and a1.case_id is not None and a1.asset_id is not None
    assert a1.analyst_hash == pseudonymize("Asha Rao", namespace="analyst")
    assert (
        db.scalar(select(func.count()).select_from(Asset).where(Asset.asset_ref_hash == "DC-01"))
        == 0
    )  # raw names never stored
    case = db.scalar(select(CaseRecord))
    assert case is not None and case.escalated and case.assignee_hash != "Asha Rao"
    a2 = db.scalar(select(Alert).where(Alert.source_ref == "A2"))
    assert a2 is not None and a2.created_at.isoformat() == "2026-01-11T03:30:00+00:00"


def test_reingest_is_idempotent(db: Session) -> None:
    _profile(db)
    _ingest(db, _frames())
    _ingest(db, _frames())
    for model, n in (
        (Alert, 3),
        (CaseRecord, 1),
        (CaseEvent, 2),
        (Escalation, 1),
        (SourceVolume, 2),
        (Asset, 2),
    ):
        assert db.scalar(select(func.count()).select_from(model)) == n, model.__name__
    assert db.scalar(select(func.count()).select_from(Submission)) == 2


def test_order_independent_linking(db: Session) -> None:
    """Alerts submitted before their cases and assets get linked when those arrive."""
    _profile(db)
    frames = _frames()
    _ingest(db, {"alerts": frames["alerts"]})
    a1 = db.scalar(select(Alert).where(Alert.source_ref == "A1"))
    assert a1 is not None and a1.case_id is None and a1.asset_id is None
    _ingest(db, {"assets": frames["assets"], "cases": frames["cases"]})
    db.refresh(a1)
    assert a1.case_id is not None and a1.asset_id is not None


def test_unknown_entity_and_bad_period(db: Session) -> None:
    with pytest.raises(IngestError, match="Unknown entity"):
        ingest_bundle(
            db,
            entity_code="NOPE",
            period_start=JAN[0],
            period_end=JAN[1],
            frames={},
            source_format="csv",
            actor="t",
        )
    _profile(db)
    with pytest.raises(IngestError, match="before"):
        ingest_bundle(
            db,
            entity_code="CSE-T-01",
            period_start=JAN[1],
            period_end=JAN[0],
            frames={},
            source_format="csv",
            actor="t",
        )


def test_rejected_submission_is_recorded(db: Session) -> None:
    _profile(db)
    sub = _ingest(db, {"alerts": pd.DataFrame({"alert_ref": ["x"]})})
    assert sub.status == "rejected"
    assert sub.dq_report_json["datasets"][0]["fatal"]

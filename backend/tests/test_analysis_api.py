from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import AnalysisRun, EntityPeriodFeature, Finding
from app.models.system import AppUser, AuditLog
from app.synth.runner import generate


def _auth(client: TestClient, db: Session, role: str = "supervisor") -> dict[str, str]:
    db.add(
        AppUser(
            username=f"a-{role}", display_name=role, pw_hash=hash_password("pw-123456"), role=role
        )
    )
    db.commit()
    tok = client.post(
        "/api/auth/login", json={"username": f"a-{role}", "password": "pw-123456"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


@pytest.fixture
def seeded(db: Session) -> None:
    generate(db, n_entities=10, months=3, seed=11, start=date(2025, 9, 1))


def test_run_lifecycle_findings_and_evidence(client: TestClient, db: Session, seeded: None) -> None:
    h = _auth(client, db)
    resp = client.post("/api/runs", headers=h, json={})
    assert resp.status_code == 202, resp.text
    run_id = resp.json()["id"]

    run = client.get(f"/api/runs/{run_id}", headers=h).json()
    assert run["status"] == "succeeded", run
    assert run["window_start"] == "2025-09-01" and run["window_end"] == "2025-12-01"
    assert len(run["config_sha256"]) == 64 and len(run["data_sha256"]) == 64
    assert run["progress"]["entities"] == 10 and not run["progress"]["errors"]
    assert run["findings"] == sum(run["findings_by_signal"].values()) > 0

    months = db.scalar(
        select(func.count())
        .select_from(EntityPeriodFeature)
        .where(EntityPeriodFeature.run_id == run_id)
    )
    assert months == 10 * 3

    page = client.get("/api/findings", headers=h).json()
    assert page["run_id"] == run_id and page["total"] == run["findings"]
    top = page["items"][0]
    assert top["narrative"] and "{" not in top["narrative"]
    severities = [f["severity"] for f in page["items"]]
    assert severities == sorted(severities, reverse=True)

    detail = client.get(f"/api/findings/{top['id']}", headers=h).json()
    assert detail["peers"] and detail["evidence_count"] > 0
    ev = client.get(f"/api/findings/{top['id']}/evidence?limit=5", headers=h).json()
    assert ev["total"] == detail["evidence_count"]
    resolved = [row for row in ev["items"] if row["record_type"] != "aggregate"]
    assert all(row["record"] is not None for row in resolved)

    filtered = client.get(f"/api/findings?signal_id={top['signal_id']}", headers=h).json()
    assert all(f["signal_id"] == top["signal_id"] for f in filtered["items"])

    evaluation = client.get(f"/api/runs/{run_id}/evaluation", headers=h).json()
    assert evaluation["healthy_entities"] + evaluation["weak_entities"] == 10

    audit = client.get("/api/audit?action=run.", headers=h).json()
    assert {r["action"] for r in audit["items"]} >= {"run.create", "run.complete"}

    # --- Phase 3: scores, ranking, profiles, review packs
    scores = client.get("/api/scores", headers=h).json()
    assert scores["run_id"] == run_id and len(scores["items"]) == 10
    assert [s["rank"] for s in scores["items"]] == list(range(1, 11))
    sais = [s["sai"] for s in scores["items"]]
    assert sais == sorted(sais, reverse=True) and "sai" in scores["formula"]
    top = scores["items"][0]
    assert top["findings"] > 0 and top["drivers"] and top["summary"].startswith(top["entity_name"])
    assert set(top["capabilities"]) >= {"threat_detection", "escalation"}

    profile = client.get(f"/api/entities/{top['entity_code']}/profile", headers=h).json()
    assert profile["score"]["rank"] == 1 and profile["findings"]
    assert len(profile["monthly"]) == 3 and len(profile["peer_monthly"]) == 3
    assert "median_close_h" in profile["monthly"][0]["features"]

    packs = client.get("/api/review/packs", headers=h).json()
    assert packs and packs[0]["entity_code"] == top["entity_code"]
    # Every pack is full; findings with only aggregate evidence roll over into controls.
    assert all(p["samples"] == p["directed"] + p["control"] == 30 for p in packs)
    assert any(p["directed"] > 0 for p in packs) and all(p["control"] >= 6 for p in packs)
    pack = client.get(f"/api/review/packs/{top['entity_code']}", headers=h).json()
    assert len(pack["items"]) == pack["samples"]
    assert all(item["record"] is not None for item in pack["items"])

    sample_id = pack["items"][0]["id"]
    done = client.patch(
        f"/api/review/samples/{sample_id}", headers=h, json={"outcome": "issue_confirmed"}
    ).json()
    assert done["outcome"] == "issue_confirmed" and done["reviewer"] == "a-supervisor"
    assert (
        client.patch(
            f"/api/review/samples/{sample_id}", headers=h, json={"outcome": "bogus"}
        ).status_code
        == 422
    )
    after = client.get(f"/api/review/packs/{top['entity_code']}", headers=h).json()
    assert after["reviewed"] == 1

    csv_resp = client.get(f"/api/review/packs/{top['entity_code']}/export.csv", headers=h)
    assert csv_resp.status_code == 200 and "text/csv" in csv_resp.headers["content-type"]
    lines = csv_resp.text.strip().splitlines()
    assert lines[0].startswith("sample_id,stratum") and len(lines) == pack["samples"] + 1
    exported = db.scalars(select(AuditLog).where(AuditLog.action == "review.export")).one()
    assert exported.actor == "a-supervisor"
    assert exported.object_ref == f"entity:{top['entity_code']}"


def test_signal_library(client: TestClient, db: Session) -> None:
    lib = client.get("/api/signals", headers=_auth(client, db)).json()
    assert len(lib["config_sha256"]) == 64
    ids = [s["id"] for s in lib["signals"]]
    assert len(ids) == 22 and {"EG-05", "NS-02", "TR-01", "AN-01"} <= set(ids)
    assert all(s["rationale"] and s["description"] for s in lib["signals"])


def test_run_guards(client: TestClient, db: Session, seeded: None) -> None:
    examiner = _auth(client, db, role="examiner")
    assert client.post("/api/runs", headers=examiner, json={}).status_code == 403
    h = _auth(client, db)
    db.add(
        AnalysisRun(
            status="running",
            started_at=datetime.now(UTC),
            code_version="t",
            config_sha256="x" * 64,
            params_json={"window_start": "2025-09-01", "window_end": "2025-12-01"},
        )
    )
    db.commit()
    assert client.post("/api/runs", headers=h, json={}).status_code == 409
    bad = client.post(
        "/api/runs", headers=h, json={"window_start": "2025-12-01", "window_end": "2025-09-01"}
    )
    assert bad.status_code == 400
    assert db.scalar(select(func.count()).select_from(Finding)) == 0

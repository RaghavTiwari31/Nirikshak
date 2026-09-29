from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.system import AppUser
from app.synth.runner import generate


def _auth(client: TestClient, db: Session, role: str = "supervisor") -> dict[str, str]:
    db.add(
        AppUser(
            username=f"i-{role}", display_name=role, pw_hash=hash_password("pw-123456"), role=role
        )
    )
    db.commit()
    tok = client.post(
        "/api/auth/login", json={"username": f"i-{role}", "password": "pw-123456"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


@pytest.fixture
def analysed(client: TestClient, db: Session) -> dict[str, str]:
    generate(db, n_entities=10, months=3, seed=21, start=date(2025, 9, 1))
    h = _auth(client, db)
    assert client.post("/api/runs", headers=h, json={}).status_code == 202
    return h


def test_coverage_views(client: TestClient, analysed: dict[str, str]) -> None:
    h = analysed
    overview = client.get("/api/coverage", headers=h).json()
    assert len(overview["rows"]) == 10 and overview["asset_types"][0] == "dc"
    holes = [r["holes"] for r in overview["rows"]]
    assert holes == sorted(holes, reverse=True)  # worst coverage first
    code = overview["rows"][0]["entity_code"]
    detail = client.get(f"/api/coverage/{code}", headers=h).json()
    assert detail["min_expected"] == 20 and detail["cells"]
    cell = detail["cells"][0]
    assert cell["category_label"] and cell["expected"] >= 0
    assert all(
        c["missing"] == (c["expected"] >= 20 and c["observed"] == 0) for c in detail["cells"]
    )
    assert client.get("/api/coverage/NOPE", headers=h).status_code == 404


def test_benchmarks_and_trends(client: TestClient, analysed: dict[str, str]) -> None:
    h = analysed
    b = client.get("/api/benchmarks?feature=escalation_rate", headers=h).json()
    assert b["percent"] and len(b["points"]) == 10 and b["median"] is not None
    values = [p["value"] for p in b["points"]]
    assert values == sorted(values, reverse=True)
    assert {"key": "escalation_rate", "label": b["label"], "percent": True} in b["features"]
    assert client.get("/api/benchmarks?feature=nope", headers=h).status_code == 400

    t = client.get("/api/trends?feature=median_ack_min", headers=h).json()
    assert len(t["periods"]) == 3 and len(t["median"]) == 3 and len(t["series"]) == 10
    assert all(len(s["values"]) == 3 for s in t["series"])


def test_finding_feedback(client: TestClient, db: Session, analysed: dict[str, str]) -> None:
    h = analysed
    finding = client.get("/api/findings", headers=h).json()["items"][0]
    resp = client.post(
        f"/api/findings/{finding['id']}/feedback",
        headers=h,
        json={"verdict": "accepted", "comment": "Confirmed on site visit"},
    )
    assert resp.status_code == 201 and resp.json()["user"] == "i-supervisor"
    assert client.get(f"/api/findings/{finding['id']}", headers=h).json()["status"] == "accepted"
    history = client.get(f"/api/findings/{finding['id']}/feedback", headers=h).json()
    assert history[0]["comment"] == "Confirmed on site visit"
    audit = client.get("/api/audit?action=finding.", headers=h).json()
    assert audit["items"][0]["action"] == "finding.feedback"

    auditor = _auth(client, db, role="auditor")
    denied = client.post(
        f"/api/findings/{finding['id']}/feedback", headers=auditor, json={"verdict": "rejected"}
    )
    assert denied.status_code == 403
    bad = client.post(
        f"/api/findings/{finding['id']}/feedback", headers=h, json={"verdict": "maybe"}
    )
    assert bad.status_code == 422

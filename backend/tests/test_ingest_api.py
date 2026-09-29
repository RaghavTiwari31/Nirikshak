import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.system import AppUser

PROFILE_CSV = (
    b"Code,Name,sector,size,soc_model,is_24x7\nCSE-API-01,API Test Bank,bfsi,small,mssp,no\n"
)

ALERTS_CSV = (
    b"Alert ID,Host Name,Source,Rule Name,Alert Type,Severity Level,Created At (IST),Verdict\n"
    b"X1,web-01,edr,EDR-1,malware,High,05/01/2026 10:00,True Positive\n"
    b"X2,web-01,edr,EDR-1,malware,Urgent,05/01/2026 11:00,Benign\n"
)


def _auth(client: TestClient, db: Session, role: str = "examiner") -> dict[str, str]:
    db.add(
        AppUser(
            username=f"u-{role}", display_name=role, pw_hash=hash_password("pw-123456"), role=role
        )
    )
    db.commit()
    token = client.post(
        "/api/auth/login", json={"username": f"u-{role}", "password": "pw-123456"}
    ).json()
    return {"Authorization": f"Bearer {token['access_token']}"}


def _upload(
    client: TestClient,
    h: dict[str, str],
    dataset: str,
    content: bytes,
    mapping: dict[str, str],
    **form: str,
) -> dict:
    resp = client.post(
        "/api/ingest/upload",
        headers=h,
        files={"file": ("f.csv", content, "text/csv")},
        data={"dataset": dataset, "mapping": json.dumps(mapping), **form},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_contract_lists_all_datasets(client: TestClient, db: Session) -> None:
    h = _auth(client, db)
    keys = {d["key"] for d in client.get("/api/ingest/contract", headers=h).json()}
    assert keys == {
        "entity_profile",
        "assets",
        "cases",
        "alerts",
        "case_events",
        "escalations",
        "source_volume",
    }


def test_preview_upload_and_list(client: TestClient, db: Session) -> None:
    h = _auth(client, db)
    prev = client.post(
        "/api/ingest/preview",
        headers=h,
        files={"file": ("p.csv", PROFILE_CSV, "text/csv")},
        data={"dataset": "entity_profile"},
    ).json()
    assert prev["unmapped_required"] == []
    res = _upload(client, h, "entity_profile", PROFILE_CSV, prev["suggested_mapping"])
    assert res["kind"] == "entity_profile" and res["entity_codes"] == ["CSE-API-01"]

    prev = client.post(
        "/api/ingest/preview",
        headers=h,
        files={"file": ("a.csv", ALERTS_CSV, "text/csv")},
        data={"dataset": "alerts"},
    ).json()
    assert prev["row_count"] == 2 and prev["suggested_mapping"]["severity"] == "Severity Level"
    res = _upload(
        client,
        h,
        "alerts",
        ALERTS_CSV,
        prev["suggested_mapping"],
        entity_code="CSE-API-01",
        period_start="2026-01-01",
        period_end="2026-01-31",
        save_mapping_as="Vendor X alerts",
    )
    sub = res["submission"]
    assert sub["status"] == "accepted_with_warnings"
    assert sub["row_counts"]["alerts"] == 1 and sub["errors"] == 1

    listing = client.get("/api/submissions", headers=h).json()
    assert listing["total"] == 1 and listing["items"][0]["entity_code"] == "CSE-API-01"
    detail = client.get(f"/api/submissions/{sub['id']}", headers=h).json()
    assert detail["dq_report"]["datasets"][0]["errors"] == {"invalid severity": 1}
    mappings = client.get("/api/mappings?dataset=alerts", headers=h).json()
    assert mappings[0]["name"] == "Vendor X alerts"
    entities = client.get("/api/entities", headers=h).json()
    assert entities[0]["submissions"] == 1


def test_json_push(client: TestClient, db: Session) -> None:
    h = _auth(client, db)
    _upload(
        client,
        h,
        "entity_profile",
        PROFILE_CSV,
        {
            "entity_code": "Code",
            "display_name": "Name",
            "sector": "sector",
            "size_tier": "size",
            "soc_model": "soc_model",
        },
    )
    body = {
        "entity_code": "CSE-API-01",
        "period_start": "2026-01-01",
        "period_end": "2026-01-31",
        "datasets": {
            "alerts": [
                {
                    "alert_ref": "J1",
                    "source_tool": "siem",
                    "rule_ref": "r",
                    "category": "auth_anomaly",
                    "severity": "low",
                    "created_at": "2026-01-02T00:00:00Z",
                }
            ]
        },
    }
    resp = client.post("/api/ingest/json", headers=h, json=body)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "accepted" and resp.json()["source_format"] == "api"


def test_auditor_cannot_upload_and_errors_are_clean(client: TestClient, db: Session) -> None:
    h = _auth(client, db, role="auditor")
    resp = client.post(
        "/api/ingest/upload",
        headers=h,
        files={"file": ("f.csv", ALERTS_CSV, "text/csv")},
        data={"dataset": "alerts", "mapping": "{}"},
    )
    assert resp.status_code == 403
    h2 = _auth(client, db, role="supervisor")
    bad = client.post(
        "/api/ingest/preview",
        headers=h2,
        files={"file": ("f.csv", b"", "text/csv")},
        data={"dataset": "alerts"},
    )
    assert bad.status_code == 400
    unknown = _upload_expect(
        client,
        h2,
        "alerts",
        ALERTS_CSV,
        {"alert_ref": "Alert ID"},
        entity_code="NOPE",
        period_start="2026-01-01",
        period_end="2026-01-31",
    )
    assert unknown.status_code == 400 and "Unknown entity" in unknown.json()["detail"]


def _upload_expect(
    client: TestClient,
    h: dict[str, str],
    dataset: str,
    content: bytes,
    mapping: dict[str, str],
    **form: str,
):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/ingest/upload",
        headers=h,
        files={"file": ("f.csv", content, "text/csv")},
        data={"dataset": dataset, "mapping": json.dumps(mapping), **form},
    )

from fastapi.testclient import TestClient


def test_health_reports_database_ok(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_openapi_schema_is_served(client: TestClient) -> None:
    assert client.get("/api/openapi.json").status_code == 200

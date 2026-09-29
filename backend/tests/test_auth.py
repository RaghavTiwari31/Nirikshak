from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.system import AppUser


def _make_user(db: Session, role: str = "supervisor", active: bool = True) -> None:
    db.add(
        AppUser(
            username="asha",
            display_name="Asha",
            pw_hash=hash_password("s3cret-pass"),
            role=role,
            is_active=active,
        )
    )
    db.commit()


def _login(client: TestClient, password: str = "s3cret-pass") -> dict:
    return client.post("/api/auth/login", json={"username": "asha", "password": password}).json()


def test_login_and_me(client: TestClient, db: Session) -> None:
    _make_user(db)
    token = _login(client)["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "supervisor"


def test_wrong_password_rejected(client: TestClient, db: Session) -> None:
    _make_user(db)
    resp = client.post("/api/auth/login", json={"username": "asha", "password": "nope"})
    assert resp.status_code == 401


def test_inactive_user_rejected(client: TestClient, db: Session) -> None:
    _make_user(db, active=False)
    resp = client.post("/api/auth/login", json={"username": "asha", "password": "s3cret-pass"})
    assert resp.status_code == 401


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
    bad = client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


def test_audit_verify_role_gate(client: TestClient, db: Session) -> None:
    _make_user(db, role="examiner")
    token = _login(client)["access_token"]
    resp = client.get("/api/audit/verify", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

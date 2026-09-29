"""Hardening: throttled login, security headers, production secret checks, CSV safety."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.robustness import _ensure_database
from app.api.review import csv_safe
from app.core.config import DEV_SECRET, Settings, check_production
from app.core.ratelimit import LoginThrottle
from app.core.security import hash_password
from app.models.system import AppUser, AuditLog


def _user(db: Session) -> None:
    db.add(
        AppUser(
            username="sec",
            display_name="s",
            pw_hash=hash_password("right-password"),
            role="supervisor",
        )
    )
    db.commit()


def test_login_is_throttled_after_repeated_failures(client: TestClient, db: Session) -> None:
    _user(db)
    for _ in range(5):
        bad = client.post("/api/auth/login", json={"username": "sec", "password": "wrong"})
        assert bad.status_code == 401
    blocked = client.post("/api/auth/login", json={"username": "sec", "password": "right-password"})
    assert blocked.status_code == 429 and int(blocked.headers["Retry-After"]) > 0
    actions = set(db.scalars(select(AuditLog.action)))
    assert {"auth.login_failed", "auth.login_throttled"} <= actions


def test_successful_login_clears_failures(client: TestClient, db: Session) -> None:
    _user(db)
    for _ in range(4):
        client.post("/api/auth/login", json={"username": "sec", "password": "wrong"})
    assert (
        client.post(
            "/api/auth/login", json={"username": "sec", "password": "right-password"}
        ).status_code
        == 200
    )
    for _ in range(4):  # the counter restarted, so four more failures are still allowed
        assert (
            client.post(
                "/api/auth/login", json={"username": "sec", "password": "wrong"}
            ).status_code
            == 401
        )


def test_throttle_window_expires() -> None:
    now = [1000.0]
    t = LoginThrottle(max_failures=2, window=60, clock=lambda: now[0])
    t.record_failure("1.2.3.4", "Bob")
    t.record_failure("1.2.3.4", "bob")  # usernames are case-insensitive
    assert t.retry_after("1.2.3.4", "BOB") == 60
    assert t.retry_after("5.6.7.8", "bob") == 0  # per client
    now[0] += 30
    assert t.retry_after("1.2.3.4", "bob") == 30
    now[0] += 31
    assert t.retry_after("1.2.3.4", "bob") == 0


def test_security_headers_on_api_responses(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["Cache-Control"] == "no-store"


def test_production_refuses_weak_secrets() -> None:
    strong_a, strong_b = "a" * 40, "b" * 40
    check_production(Settings(environment="development"))  # dev defaults are fine
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        check_production(
            Settings(environment="production", jwt_secret=DEV_SECRET, pseudonym_hmac_key=strong_b)
        )
    with pytest.raises(RuntimeError, match="at least 32"):
        check_production(
            Settings(environment="production", jwt_secret="short", pseudonym_hmac_key=strong_b)
        )
    with pytest.raises(RuntimeError, match="different"):
        check_production(
            Settings(environment="production", jwt_secret=strong_a, pseudonym_hmac_key=strong_a)
        )
    check_production(
        Settings(environment="production", jwt_secret=strong_a, pseudonym_hmac_key=strong_b)
    )


def test_csv_formula_injection_is_neutralised() -> None:
    assert csv_safe('=HYPERLINK("http://x","click")') == '\'=HYPERLINK("http://x","click")'
    assert csv_safe("+cmd") == "'+cmd" and csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert csv_safe("EDR-MAL-004 Suspicious") == "EDR-MAL-004 Suspicious"
    assert csv_safe(42) == 42 and csv_safe(None) is None


def test_scratch_database_name_is_validated() -> None:
    with pytest.raises(ValueError):
        _ensure_database('x"; DROP DATABASE satsa; --')

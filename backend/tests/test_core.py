from app.core.config import Settings
from app.core.pseudonymize import TOKEN_LENGTH, pseudonymize
from app.core.security import hash_password, verify_password


def test_database_url_normalised_to_psycopg() -> None:
    s = Settings(database_url="postgres://u:p@host/db?sslmode=require")
    assert s.database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"


def test_pseudonymize_is_stable_and_namespaced() -> None:
    a = pseudonymize("HOST-01", namespace="asset")
    assert a == pseudonymize("  host-01 ", namespace="asset")
    assert a != pseudonymize("host-01", namespace="analyst")
    assert a is not None and len(a) == TOKEN_LENGTH
    assert pseudonymize("") is None and pseudonymize(None) is None


def test_password_hashing_roundtrip() -> None:
    h = hash_password("correct horse")
    assert verify_password("correct horse", h)
    assert not verify_password("wrong", h)
    assert not verify_password("x", "not-a-bcrypt-hash")

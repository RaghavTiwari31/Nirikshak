from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "change-me-dev-only"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://satsa:satsa_dev@localhost:5432/satsa"
    jwt_secret: str = DEV_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    pseudonym_hmac_key: str = DEV_SECRET
    cors_origins: str = "http://localhost:5173"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # Neon/Render hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


MIN_SECRET_LENGTH = 32


def check_production(settings: Settings) -> None:
    """Refuse to start in production with default or guessable secrets."""
    if not settings.is_production:
        return
    for name, value in (
        ("JWT_SECRET", settings.jwt_secret),
        ("PSEUDONYM_HMAC_KEY", settings.pseudonym_hmac_key),
    ):
        if value == DEV_SECRET or len(value) < MIN_SECRET_LENGTH:
            raise RuntimeError(
                f"{name} must be set to a random value of at least {MIN_SECRET_LENGTH} "
                "characters in production (e.g. `openssl rand -hex 32`)"
            )
    if settings.jwt_secret == settings.pseudonym_hmac_key:
        raise RuntimeError("JWT_SECRET and PSEUDONYM_HMAC_KEY must be different")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    check_production(settings)
    return settings

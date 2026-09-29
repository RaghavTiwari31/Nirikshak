from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str


class AuditVerifyResponse(BaseModel):
    ok: bool
    checked: int
    first_broken_id: int | None = None
    reason: str | None = None

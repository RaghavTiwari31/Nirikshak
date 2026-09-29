import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import __version__
from app.api.deps import require_roles
from app.audit.chain import verify_chain
from app.core.db import get_db
from app.models.enums import UserRole
from app.models.system import AuditLog
from app.schemas.analysis import AuditPage, AuditRow
from app.schemas.system import AuditVerifyResponse, HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    """Liveness + DB check. The frontend polls this to cover Render cold starts."""
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        database = "unavailable"
    return HealthResponse(
        status="ok" if database == "ok" else "degraded", version=__version__, database=database
    )


@router.get(
    "/audit",
    response_model=AuditPage,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.AUDITOR))],
)
def audit_log(
    action: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AuditPage:
    q = select(AuditLog)
    if action:
        q = q.where(AuditLog.action.startswith(action))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(AuditLog.id.desc()).limit(limit).offset(offset))
    return AuditPage(
        total=total,
        items=[
            AuditRow(
                id=r.id,
                ts=r.ts,
                actor=r.actor,
                action=r.action,
                object_ref=r.object_ref,
                payload=r.payload_json or {},
                hash=r.hash,
            )
            for r in rows
        ],
    )


@router.get(
    "/audit/verify",
    response_model=AuditVerifyResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.AUDITOR))],
)
def audit_verify(db: Session = Depends(get_db)) -> AuditVerifyResponse:
    result = verify_chain(db)
    return AuditVerifyResponse(**result.__dict__)

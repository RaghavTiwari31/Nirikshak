from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.audit.chain import append_audit
from app.core.db import get_db
from app.core.ratelimit import login_throttle
from app.core.security import create_access_token, verify_password
from app.models.system import AppUser
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    client = request.client.host if request.client else "unknown"
    wait = login_throttle.retry_after(client, body.username)
    if wait:
        append_audit(
            db, actor=body.username, action="auth.login_throttled", payload={"client": client}
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )

    user = db.scalar(select(AppUser).where(AppUser.username == body.username))
    if user is None or not user.is_active or not verify_password(body.password, user.pw_hash):
        login_throttle.record_failure(client, body.username)
        append_audit(
            db, actor=body.username, action="auth.login_failed", payload={"client": client}
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    login_throttle.reset(client, body.username)
    append_audit(db, actor=user.username, action="auth.login", object_ref=f"user:{user.id}")
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.username, user.role),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: AppUser = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)

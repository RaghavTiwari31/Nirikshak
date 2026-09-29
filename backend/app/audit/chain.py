"""Hash-chained audit log.

Each row stores hash = sha256(prev_hash + canonical_json(row)). Changing, deleting or
reordering any row breaks every hash after it, which verify_chain() detects.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.system import AuditLog

GENESIS_HASH = "0" * 64
# Arbitrary constant key: serialises writers so two appends never share a prev_hash.
_ADVISORY_LOCK_KEY = 7_220_531


def _canonical(
    ts: datetime, actor: str, action: str, object_ref: str | None, payload: dict[str, Any]
) -> str:
    body = {
        "ts": ts.astimezone(UTC).isoformat(timespec="microseconds"),
        "actor": actor,
        "action": action,
        "object_ref": object_ref,
        "payload": payload,
    }
    return json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)


def compute_hash(
    prev_hash: str,
    ts: datetime,
    actor: str,
    action: str,
    object_ref: str | None,
    payload: dict[str, Any],
) -> str:
    canonical = _canonical(ts, actor, action, object_ref, payload)
    return hashlib.sha256((prev_hash + canonical).encode()).hexdigest()


def append_audit(
    db: Session,
    *,
    actor: str,
    action: str,
    object_ref: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    """Append an audit entry. Flushes but does not commit; the caller owns the transaction."""
    payload = payload or {}
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _ADVISORY_LOCK_KEY})
    prev_hash = db.scalar(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1))
    prev_hash = prev_hash or GENESIS_HASH
    # Python and Postgres both keep microseconds, so ts round-trips exactly for verification.
    ts = utcnow()
    entry = AuditLog(
        ts=ts,
        actor=actor,
        action=action,
        object_ref=object_ref,
        payload_json=payload,
        prev_hash=prev_hash,
        hash=compute_hash(prev_hash, ts, actor, action, object_ref, payload),
    )
    db.add(entry)
    db.flush()
    return entry


@dataclass
class ChainVerification:
    ok: bool
    checked: int
    first_broken_id: int | None = None
    reason: str | None = None


def verify_chain(db: Session, batch_size: int = 5000) -> ChainVerification:
    expected_prev = GENESIS_HASH
    checked = 0
    last_id = 0
    while True:
        rows = db.scalars(
            select(AuditLog).where(AuditLog.id > last_id).order_by(AuditLog.id).limit(batch_size)
        ).all()
        if not rows:
            return ChainVerification(ok=True, checked=checked)
        for row in rows:
            if row.prev_hash != expected_prev:
                return ChainVerification(False, checked, row.id, "prev_hash does not link")
            recomputed = compute_hash(
                row.prev_hash, row.ts, row.actor, row.action, row.object_ref, row.payload_json
            )
            if recomputed != row.hash:
                return ChainVerification(False, checked, row.id, "row content was modified")
            expected_prev = row.hash
            checked += 1
            last_id = row.id

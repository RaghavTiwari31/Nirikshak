from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit.chain import GENESIS_HASH, append_audit, verify_chain
from app.models.system import AuditLog


def _seed(db: Session, n: int = 5) -> None:
    for i in range(n):
        append_audit(
            db,
            actor="tester",
            action="test.event",
            object_ref=f"obj:{i}",
            payload={"i": i, "note": "ok"},
        )
    db.commit()


def test_chain_links_from_genesis(db: Session) -> None:
    _seed(db)
    first = db.query(AuditLog).order_by(AuditLog.id).first()
    assert first is not None and first.prev_hash == GENESIS_HASH
    result = verify_chain(db)
    assert result.ok and result.checked == 5


def test_tampered_payload_is_detected(db: Session) -> None:
    _seed(db)
    target = db.query(AuditLog).order_by(AuditLog.id).offset(2).first()
    assert target is not None
    db.execute(
        update(AuditLog)
        .where(AuditLog.id == target.id)
        .values(payload_json={"i": 999, "note": "ok"})
    )
    db.commit()
    result = verify_chain(db)
    assert not result.ok
    assert result.first_broken_id == target.id


def test_deleted_row_is_detected(db: Session) -> None:
    _seed(db)
    target = db.query(AuditLog).order_by(AuditLog.id).offset(1).first()
    db.delete(target)
    db.commit()
    assert not verify_chain(db).ok

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.entities import Entity, Submission
from app.schemas.ingest import EntityOut

router = APIRouter(tags=["entities"], dependencies=[Depends(get_current_user)])


@router.get("/entities", response_model=list[EntityOut])
def list_entities(db: Session = Depends(get_db)) -> list[EntityOut]:
    subs = (
        select(
            Submission.entity_id,
            func.count().label("n"),
            func.max(Submission.period_end).label("last"),
        )
        .where(Submission.status != "rejected")
        .group_by(Submission.entity_id)
        .subquery()
    )
    rows = db.execute(
        select(Entity, subs.c.n, subs.c.last)
        .outerjoin(subs, subs.c.entity_id == Entity.id)
        .order_by(Entity.code)
    ).all()
    return [
        EntityOut(
            id=e.id,
            code=e.code,
            display_name=e.display_name,
            sector=e.sector,
            size_tier=e.size_tier,
            soc_model=e.soc_model,
            declared_24x7=e.declared_24x7,
            submissions=n or 0,
            last_period_end=last,
        )
        for e, n, last in rows
    ]

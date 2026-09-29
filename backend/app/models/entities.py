"""Submitted evidence: entities, their submissions, inventories, alerts and cases."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class Entity(CreatedAtMixin, Base):
    """A Critical Sector Entity (CSE) under supervision."""

    __tablename__ = "entity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    display_name: Mapped[str] = mapped_column(String(128))
    sector: Mapped[str] = mapped_column(String(32), index=True)
    size_tier: Mapped[str] = mapped_column(String(16))
    soc_model: Mapped[str] = mapped_column(String(16))
    # Declared posture, compared against observed behaviour (execution gaps).
    declared_24x7: Mapped[bool] = mapped_column(Boolean, default=False)
    declared_sla_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    declared_mttr_hours: Mapped[float | None] = mapped_column(Float)
    declared_coverage_pct: Mapped[float | None] = mapped_column(Float)


class Submission(CreatedAtMixin, Base):
    """One periodic data submission from an entity."""

    __tablename__ = "submission"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_format: Mapped[str] = mapped_column(String(16))
    file_sha256: Mapped[str | None] = mapped_column(String(64))
    row_counts_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    dq_report_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="processing")


class Asset(Base):
    __tablename__ = "asset"
    __table_args__ = (UniqueConstraint("entity_id", "asset_ref_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"), index=True)
    asset_ref_hash: Mapped[str] = mapped_column(String(64))
    asset_type: Mapped[str] = mapped_column(String(16))
    environment: Mapped[str] = mapped_column(String(8))
    criticality: Mapped[int] = mapped_column(SmallInteger)
    expected_sources: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)


class CaseRecord(Base):
    __tablename__ = "case_record"
    __table_args__ = (
        UniqueConstraint("entity_id", "source_ref"),
        Index("ix_case_record_entity_closed", "entity_id", "closed_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"))
    submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("submission.id", ondelete="SET NULL")
    )
    source_ref: Mapped[str] = mapped_column(String(64))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    assignee_hash: Mapped[str | None] = mapped_column(String(64))
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_level: Mapped[str | None] = mapped_column(String(16))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(String(128))
    remediation_action: Mapped[str | None] = mapped_column(String(128))
    reopened_count: Mapped[int] = mapped_column(SmallInteger, default=0)


class Alert(Base):
    __tablename__ = "alert"
    __table_args__ = (
        UniqueConstraint("entity_id", "source_ref"),
        Index("ix_alert_entity_created", "entity_id", "created_at"),
        Index("ix_alert_entity_severity_closed", "entity_id", "severity", "closed_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"))
    submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("submission.id", ondelete="SET NULL")
    )
    source_ref: Mapped[str] = mapped_column(String(64))
    asset_id: Mapped[int | None] = mapped_column(
        ForeignKey("asset.id", ondelete="SET NULL"), index=True
    )
    # Submitted references are kept so links resolve whatever order files arrive in,
    # and so alerts on assets missing from the inventory stay visible.
    asset_ref_hash: Mapped[str | None] = mapped_column(String(64))
    case_ref: Mapped[str | None] = mapped_column(String(64))
    source_tool: Mapped[str] = mapped_column(String(16))
    rule_ref: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(48))
    mitre_tactic: Mapped[str | None] = mapped_column(String(48))
    severity: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disposition: Mapped[str] = mapped_column(String(16), default="open")
    case_id: Mapped[int | None] = mapped_column(
        ForeignKey("case_record.id", ondelete="SET NULL"), index=True
    )
    analyst_hash: Mapped[str | None] = mapped_column(String(64))


class CaseEvent(Base):
    __tablename__ = "case_event"
    __table_args__ = (UniqueConstraint("case_id", "ts", "action"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("case_record.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    action: Mapped[str] = mapped_column(String(16))
    actor_hash: Mapped[str | None] = mapped_column(String(64))


class Escalation(Base):
    __tablename__ = "escalation"
    __table_args__ = (UniqueConstraint("case_id", "ts", "to_tier"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[int] = mapped_column(
        ForeignKey("case_record.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    from_tier: Mapped[str] = mapped_column(String(16))
    to_tier: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str | None] = mapped_column(String(256))


class SourceVolume(Base):
    """Optional daily event counts per source: aggregates only, never raw logs."""

    __tablename__ = "source_volume"

    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entity.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("asset.id", ondelete="CASCADE"), primary_key=True
    )
    source_tool: Mapped[str] = mapped_column(String(16), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    event_count: Mapped[int] = mapped_column(Integer)


class ColumnMapping(CreatedAtMixin, Base):
    """Saved mapping from an entity's export columns to the canonical schema."""

    __tablename__ = "column_mapping"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int | None] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(64))
    dataset: Mapped[str] = mapped_column(String(32))
    source_format: Mapped[str] = mapped_column(String(16))
    mapping_json: Mapped[dict[str, Any]] = mapped_column(JSONB)

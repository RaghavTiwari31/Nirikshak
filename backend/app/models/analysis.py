"""Analysis outputs: runs, features, findings, scores, review samples, feedback."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class AnalysisRun(Base):
    """One reproducible analysis run; the manifest fields make it re-executable."""

    __tablename__ = "analysis_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    code_version: Mapped[str] = mapped_column(String(64))
    config_sha256: Mapped[str] = mapped_column(String(64))
    data_sha256: Mapped[str | None] = mapped_column(String(64))
    params_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    progress_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # Peer baselines per signal (median, scale, per-entity values) for charts and audits.
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[str | None] = mapped_column(String(64))


class EntityPeriodFeature(Base):
    __tablename__ = "entity_period_feature"

    run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_run.id", ondelete="CASCADE"), primary_key=True
    )
    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entity.id", ondelete="CASCADE"), primary_key=True
    )
    period: Mapped[date] = mapped_column(Date, primary_key=True)
    feature_json: Mapped[dict[str, float]] = mapped_column(JSONB)


class Finding(Base):
    __tablename__ = "finding"
    __table_args__ = (Index("ix_finding_run_entity", "run_id", "entity_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("analysis_run.id", ondelete="CASCADE"))
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"))
    period: Mapped[date | None] = mapped_column(Date)
    signal_id: Mapped[str] = mapped_column(String(16), index=True)
    signal_version: Mapped[str] = mapped_column(String(16))
    family: Mapped[str] = mapped_column(String(24))
    capability: Mapped[str] = mapped_column(String(32))
    severity: Mapped[int] = mapped_column(Integer)  # 1 (low) .. 4 (critical)
    confidence: Mapped[float] = mapped_column(Float)  # 0..1
    metric_value: Mapped[float | None] = mapped_column(Float)
    threshold: Mapped[float | None] = mapped_column(Float)
    peer_percentile: Mapped[float | None] = mapped_column(Float)
    title: Mapped[str] = mapped_column(String(256))
    narrative: Mapped[str] = mapped_column(Text)
    details_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="open")


class FindingEvidence(Base):
    __tablename__ = "finding_evidence"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    finding_id: Mapped[int] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), index=True
    )
    record_type: Mapped[str] = mapped_column(String(16))  # alert | case | asset | aggregate
    record_id: Mapped[int | None] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(256))


class EntityScore(Base):
    __tablename__ = "entity_score"

    run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_run.id", ondelete="CASCADE"), primary_key=True
    )
    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entity.id", ondelete="CASCADE"), primary_key=True
    )
    period: Mapped[date] = mapped_column(Date, primary_key=True)
    capability_scores_json: Mapped[dict[str, float]] = mapped_column(JSONB)
    sai: Mapped[float] = mapped_column(Float)  # Supervisory Attention Index, 0..100
    rank: Mapped[int] = mapped_column(Integer)
    # Top contributing findings, per-capability deficits and the summary sentence.
    drivers_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class ReviewSample(Base):
    __tablename__ = "review_sample"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_run.id", ondelete="CASCADE"), index=True
    )
    entity_id: Mapped[int] = mapped_column(ForeignKey("entity.id", ondelete="CASCADE"))
    record_type: Mapped[str] = mapped_column(String(16))
    record_id: Mapped[int] = mapped_column(BigInteger)
    stratum: Mapped[str] = mapped_column(String(32))  # finding:<signal_id> | random_control
    reason: Mapped[str | None] = mapped_column(String(256))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewer: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[str | None] = mapped_column(String(32))


class SupervisorFeedback(CreatedAtMixin, Base):
    __tablename__ = "supervisor_feedback"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    finding_id: Mapped[int] = mapped_column(
        ForeignKey("finding.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    verdict: Mapped[str] = mapped_column(String(16))
    comment: Mapped[str | None] = mapped_column(Text)


class ValidationStudy(CreatedAtMixin, Base):
    """One robustness configuration (fresh synthetic dataset, seed, planted intensity) and
    how the frozen signal library performed on it. Produced by `cli robustness`."""

    __tablename__ = "validation_study"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch: Mapped[str] = mapped_column(String(32), index=True)
    seed: Mapped[int] = mapped_column(Integer)
    intensity_scale: Mapped[float] = mapped_column(Float)
    config_sha256: Mapped[str] = mapped_column(String(64))
    results_json: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class SyntheticTruth(Base):
    """Ground truth planted by the synthetic generator; used only for validation."""

    __tablename__ = "synthetic_truth"

    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entity.id", ondelete="CASCADE"), primary_key=True
    )
    archetype: Mapped[str] = mapped_column(String(32))
    planted_signals: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)
    severity: Mapped[int] = mapped_column(Integer, default=0)

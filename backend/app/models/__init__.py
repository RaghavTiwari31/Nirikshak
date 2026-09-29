"""Importing this package registers every table on Base.metadata (used by Alembic)."""

from app.models.analysis import (
    AnalysisRun,
    EntityPeriodFeature,
    EntityScore,
    Finding,
    FindingEvidence,
    ReviewSample,
    SupervisorFeedback,
    SyntheticTruth,
)
from app.models.base import Base
from app.models.entities import (
    Alert,
    Asset,
    CaseEvent,
    CaseRecord,
    ColumnMapping,
    Entity,
    Escalation,
    SourceVolume,
    Submission,
)
from app.models.system import AppUser, AuditLog

__all__ = [
    "Alert",
    "AnalysisRun",
    "AppUser",
    "Asset",
    "AuditLog",
    "Base",
    "CaseEvent",
    "CaseRecord",
    "ColumnMapping",
    "Entity",
    "EntityPeriodFeature",
    "EntityScore",
    "Escalation",
    "Finding",
    "FindingEvidence",
    "ReviewSample",
    "SourceVolume",
    "Submission",
    "SupervisorFeedback",
    "SyntheticTruth",
]

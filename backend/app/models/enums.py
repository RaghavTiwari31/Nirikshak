"""Controlled vocabularies for the canonical data model.

Stored as plain strings in Postgres (no native enum types) so adding a value never
needs a migration; ingestion validates against these sets.
"""

from enum import StrEnum


class Sector(StrEnum):
    POWER_ENERGY = "power_energy"
    BFSI = "bfsi"
    TELECOM = "telecom"
    TRANSPORT = "transport"
    GOVERNMENT = "government"
    STRATEGIC_PUBLIC = "strategic_public"


class SizeTier(StrEnum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


class SocModel(StrEnum):
    INHOUSE = "inhouse"
    MSSP = "mssp"
    HYBRID = "hybrid"


class AssetType(StrEnum):
    DOMAIN_CONTROLLER = "dc"
    SERVER = "server"
    ENDPOINT = "endpoint"
    FIREWALL = "firewall"
    DATABASE = "db"
    OT_SCADA = "ot_scada"
    OT_HMI = "ot_hmi"
    CLOUD = "cloud"
    EMAIL_GATEWAY = "email_gw"


class Environment(StrEnum):
    IT = "it"
    OT = "ot"
    DMZ = "dmz"
    CLOUD = "cloud"


class SourceTool(StrEnum):
    EDR = "edr"
    SIEM = "siem"
    IDS = "ids"
    FIREWALL = "fw"
    EMAIL = "email"
    OT_IDS = "ot_ids"


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Disposition(StrEnum):
    TRUE_POSITIVE = "tp"
    FALSE_POSITIVE = "fp"
    BENIGN = "benign"
    DUPLICATE = "dup"
    OPEN = "open"


class CaseAction(StrEnum):
    ASSIGN = "assign"
    COMMENT = "comment"
    CONTAIN = "contain"
    ESCALATE = "escalate"
    CLOSE = "close"
    REOPEN = "reopen"


class EscalationTier(StrEnum):
    L1 = "l1"
    L2 = "l2"
    L3 = "l3"
    CISO = "ciso"
    CERT_IN = "cert_in"
    NCIIPC = "nciipc"


class CaseStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class SubmissionStatus(StrEnum):
    PROCESSING = "processing"
    ACCEPTED = "accepted"
    ACCEPTED_WITH_WARNINGS = "accepted_with_warnings"
    REJECTED = "rejected"


class Capability(StrEnum):
    THREAT_DETECTION = "threat_detection"
    INVESTIGATION = "investigation"
    ESCALATION = "escalation"
    INCIDENT_RESPONSE = "incident_response"
    SECURITY_OPERATIONS = "security_operations"
    GOVERNANCE = "governance"
    OPERATIONAL_DISCIPLINE = "operational_discipline"
    CYBER_RESILIENCE = "cyber_resilience"


class FindingFamily(StrEnum):
    EXECUTION_GAP = "execution_gap"
    NEGATIVE_SPACE = "negative_space"
    ANOMALY = "anomaly"
    TREND = "trend"


class FindingStatus(StrEnum):
    OPEN = "open"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    NEEDS_INFO = "needs_info"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class UserRole(StrEnum):
    ADMIN = "admin"
    SUPERVISOR = "supervisor"
    EXAMINER = "examiner"
    AUDITOR = "auditor"

"""The SAT-SA data contract: what a CSE submission contains.

This single definition drives validation, the column-mapping UI (/api/ingest/contract)
and the data-requirements documentation. Identifier fields marked `pseudonymize` are
HMAC-hashed on ingestion, so raw hostnames and analyst names are never stored.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal

from app.domain.taxonomy import CATEGORIES
from app.models import enums

FieldKind = Literal["str", "text", "int", "float", "bool", "datetime", "date", "enum", "list"]


def _values(e: type[StrEnum]) -> tuple[str, ...]:
    return tuple(m.value for m in e)


@dataclass(frozen=True)
class FieldSpec:
    name: str
    kind: FieldKind
    required: bool = False
    description: str = ""
    enum: tuple[str, ...] | None = None
    synonyms: tuple[str, ...] = ()
    pseudonymize: str | None = None  # namespace for the HMAC token
    max_len: int | None = None
    # Values outside `enum` are accepted with a warning (open vocabularies).
    open_enum: bool = False


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    description: str
    fields: tuple[FieldSpec, ...]
    natural_key: tuple[str, ...]
    time_field: str | None = None
    per_entity: bool = True
    fields_by_name: dict[str, FieldSpec] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "fields_by_name", {f.name: f for f in self.fields})

    @property
    def required_fields(self) -> list[str]:
        return [f.name for f in self.fields if f.required]


SEVERITIES = _values(enums.Severity)

ENTITY_PROFILE = DatasetSpec(
    key="entity_profile",
    label="Entity profile",
    description="One row per CSE: sector, SOC model and declared (self-reported) posture.",
    per_entity=False,
    natural_key=("entity_code",),
    fields=(
        FieldSpec(
            "entity_code",
            "str",
            True,
            "Unique entity identifier",
            max_len=32,
            synonyms=("code", "cse_code", "entity_id", "org_code"),
        ),
        FieldSpec(
            "display_name",
            "str",
            True,
            "Entity name",
            max_len=128,
            synonyms=("name", "entity_name", "organisation", "organization"),
        ),
        FieldSpec("sector", "enum", True, "Critical sector", enum=_values(enums.Sector)),
        FieldSpec(
            "size_tier",
            "enum",
            True,
            "Relative size",
            enum=_values(enums.SizeTier),
            synonyms=("size",),
        ),
        FieldSpec(
            "soc_model",
            "enum",
            True,
            "SOC operating model",
            enum=_values(enums.SocModel),
            synonyms=("soc_type",),
        ),
        FieldSpec(
            "declared_24x7",
            "bool",
            False,
            "Entity claims round-the-clock monitoring",
            synonyms=("is_24x7", "coverage_24x7"),
        ),
        FieldSpec("declared_sla_hours_critical", "float", False, "Declared time-to-close SLA"),
        FieldSpec("declared_sla_hours_high", "float"),
        FieldSpec("declared_sla_hours_medium", "float"),
        FieldSpec("declared_sla_hours_low", "float"),
        FieldSpec(
            "declared_mttr_hours",
            "float",
            False,
            "Self-reported mean time to resolve",
            synonyms=("mttr",),
        ),
        FieldSpec(
            "declared_coverage_pct",
            "float",
            False,
            "Self-reported monitoring coverage of assets (%)",
            synonyms=("coverage",),
        ),
    ),
)

ASSETS = DatasetSpec(
    key="assets",
    label="Asset inventory",
    description="Systems in scope for monitoring, with type, environment and criticality.",
    natural_key=("asset_ref",),
    fields=(
        FieldSpec(
            "asset_ref",
            "str",
            True,
            "Hostname or asset ID",
            pseudonymize="asset",
            synonyms=("hostname", "host", "asset_id", "asset_name"),
        ),
        FieldSpec(
            "asset_type",
            "enum",
            True,
            "Asset class",
            enum=_values(enums.AssetType),
            synonyms=("type", "asset_class"),
        ),
        FieldSpec(
            "environment",
            "enum",
            True,
            "Network zone",
            enum=_values(enums.Environment),
            synonyms=("zone", "env"),
        ),
        FieldSpec(
            "criticality",
            "int",
            True,
            "1 (low) to 4 (critical)",
            synonyms=("crit", "criticality_level"),
        ),
        FieldSpec(
            "expected_sources",
            "list",
            False,
            "Log sources expected from this asset (; separated)",
            enum=_values(enums.SourceTool),
            synonyms=("log_sources", "sources"),
        ),
    ),
)

CASES = DatasetSpec(
    key="cases",
    label="Case records",
    description="Investigations opened from alerts, with outcome and remediation.",
    natural_key=("case_ref",),
    time_field="opened_at",
    fields=(
        FieldSpec(
            "case_ref",
            "str",
            True,
            "Case / ticket ID",
            max_len=64,
            synonyms=("case_id", "ticket_id", "incident_id", "case_number"),
        ),
        FieldSpec(
            "opened_at",
            "datetime",
            True,
            "When the case was opened",
            synonyms=("created", "created_at", "open_time", "opened"),
        ),
        FieldSpec("closed_at", "datetime", False, synonyms=("closed", "close_time", "resolved_at")),
        FieldSpec(
            "priority", "enum", True, "Case priority", enum=SEVERITIES, synonyms=("severity",)
        ),
        FieldSpec("status", "enum", True, enum=_values(enums.CaseStatus), synonyms=("state",)),
        FieldSpec(
            "assignee",
            "str",
            False,
            "Analyst",
            pseudonymize="analyst",
            synonyms=("owner", "assigned_to", "analyst"),
        ),
        FieldSpec("escalated", "bool", False, synonyms=("is_escalated",)),
        FieldSpec("escalation_level", "enum", False, enum=_values(enums.EscalationTier)),
        FieldSpec(
            "resolution_note",
            "text",
            False,
            "Analyst's closing notes",
            max_len=4000,
            synonyms=("notes", "resolution", "closure_notes", "comments"),
        ),
        FieldSpec("root_cause", "str", False, max_len=128),
        FieldSpec(
            "remediation_action",
            "str",
            False,
            max_len=128,
            synonyms=("remediation", "action_taken"),
        ),
        FieldSpec("reopened_count", "int", False, synonyms=("reopens",)),
    ),
)

ALERTS = DatasetSpec(
    key="alerts",
    label="Alert metadata",
    description="Alerts raised by security tools and how the SOC handled them.",
    natural_key=("alert_ref",),
    time_field="created_at",
    fields=(
        FieldSpec(
            "alert_ref",
            "str",
            True,
            "Alert ID",
            max_len=64,
            synonyms=("alert_id", "id", "event_id", "alertid"),
        ),
        FieldSpec(
            "asset_ref",
            "str",
            False,
            "Affected asset",
            pseudonymize="asset",
            synonyms=("hostname", "host", "asset", "asset_id"),
        ),
        FieldSpec(
            "source_tool",
            "enum",
            True,
            "Tool that raised the alert",
            enum=_values(enums.SourceTool),
            synonyms=("source", "tool", "product"),
        ),
        FieldSpec(
            "rule_ref",
            "str",
            True,
            "Detection rule name / ID",
            max_len=128,
            synonyms=("rule", "rule_name", "detector", "signature", "alert_name"),
        ),
        FieldSpec(
            "category",
            "enum",
            True,
            "Alert category",
            enum=tuple(CATEGORIES),
            open_enum=True,
            synonyms=("alert_category", "type", "alert_type"),
        ),
        FieldSpec("mitre_tactic", "str", False, max_len=48, synonyms=("tactic",)),
        FieldSpec(
            "severity",
            "enum",
            True,
            enum=SEVERITIES,
            synonyms=("sev", "severity_level", "priority"),
        ),
        FieldSpec(
            "created_at",
            "datetime",
            True,
            synonyms=("created", "timestamp", "time", "raised_at", "event_time"),
        ),
        FieldSpec(
            "acknowledged_at",
            "datetime",
            False,
            synonyms=("acknowledged", "ack_time", "ack_at", "triaged_at"),
        ),
        FieldSpec("closed_at", "datetime", False, synonyms=("closed", "close_time", "resolved_at")),
        FieldSpec(
            "disposition",
            "enum",
            False,
            enum=_values(enums.Disposition),
            synonyms=("verdict", "outcome", "classification", "resolution"),
        ),
        FieldSpec(
            "case_ref",
            "str",
            False,
            "Linked case ID",
            max_len=64,
            synonyms=("case_id", "ticket_id", "incident_id"),
        ),
        FieldSpec(
            "analyst",
            "str",
            False,
            "Handling analyst",
            pseudonymize="analyst",
            synonyms=("assignee", "owner", "handled_by", "user"),
        ),
    ),
)

CASE_EVENTS = DatasetSpec(
    key="case_events",
    label="Case workflow events",
    description="Actions taken on each case: assignment, comments, containment, closure.",
    natural_key=("case_ref", "ts", "action"),
    fields=(
        FieldSpec("case_ref", "str", True, max_len=64, synonyms=("case_id", "ticket_id")),
        FieldSpec("ts", "datetime", True, synonyms=("timestamp", "time", "event_time")),
        FieldSpec(
            "action",
            "enum",
            True,
            enum=_values(enums.CaseAction),
            synonyms=("event", "event_type", "activity"),
        ),
        FieldSpec(
            "actor",
            "str",
            False,
            pseudonymize="analyst",
            synonyms=("user", "analyst", "performed_by"),
        ),
    ),
)

ESCALATIONS = DatasetSpec(
    key="escalations",
    label="Escalation records",
    description="Escalations from the SOC to higher tiers, management or authorities.",
    natural_key=("case_ref", "ts", "to_tier"),
    fields=(
        FieldSpec("case_ref", "str", True, max_len=64, synonyms=("case_id", "ticket_id")),
        FieldSpec("ts", "datetime", True, synonyms=("timestamp", "escalated_at", "time")),
        FieldSpec(
            "from_tier", "enum", True, enum=_values(enums.EscalationTier), synonyms=("from",)
        ),
        FieldSpec("to_tier", "enum", True, enum=_values(enums.EscalationTier), synonyms=("to",)),
        FieldSpec("reason", "str", False, max_len=256),
    ),
)

SOURCE_VOLUME = DatasetSpec(
    key="source_volume",
    label="Daily source volume",
    description="Optional daily event counts per asset and log source (aggregates only).",
    natural_key=("asset_ref", "source_tool", "day"),
    time_field="day",
    fields=(
        FieldSpec(
            "asset_ref",
            "str",
            True,
            pseudonymize="asset",
            synonyms=("hostname", "host", "asset_id"),
        ),
        FieldSpec(
            "source_tool", "enum", True, enum=_values(enums.SourceTool), synonyms=("source", "tool")
        ),
        FieldSpec("day", "date", True, synonyms=("date",)),
        FieldSpec("event_count", "int", True, synonyms=("count", "events", "volume")),
    ),
)

DATASETS: dict[str, DatasetSpec] = {
    d.key: d
    for d in (ENTITY_PROFILE, ASSETS, CASES, ALERTS, CASE_EVENTS, ESCALATIONS, SOURCE_VOLUME)
}

# Order matters: later datasets reference earlier ones.
LOAD_ORDER = ("assets", "cases", "alerts", "case_events", "escalations", "source_volume")

# Common spellings mapped onto canonical enum values.
ENUM_ALIASES: dict[str, dict[str, str]] = {
    "severity": {
        "crit": "critical",
        "p1": "critical",
        "sev1": "critical",
        "p2": "high",
        "sev2": "high",
        "med": "medium",
        "moderate": "medium",
        "p3": "medium",
        "sev3": "medium",
        "info": "low",
        "informational": "low",
        "p4": "low",
        "sev4": "low",
    },
    "disposition": {
        "true_positive": "tp",
        "truepositive": "tp",
        "false_positive": "fp",
        "falsepositive": "fp",
        "benign_positive": "benign",
        "duplicate": "dup",
        "new": "open",
        "in_progress": "open",
    },
    "status": {"resolved": "closed", "done": "closed", "in_progress": "open", "new": "open"},
    "source_tool": {
        "firewall": "fw",
        "e-mail": "email",
        "mail": "email",
        "ot-ids": "ot_ids",
        "nids": "ids",
        "ips": "ids",
    },
}

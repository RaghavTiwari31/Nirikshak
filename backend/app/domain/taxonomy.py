"""Alert-category taxonomy shared by ingestion, the synthetic generator and analytics.

Each category records which asset types and source tools normally produce it. That is
the basis of the expected-evidence model: a domain controller that never raises an
authentication alert is "negative space".
"""

from dataclasses import dataclass

from app.models.enums import AssetType, SourceTool


@dataclass(frozen=True)
class AlertCategory:
    key: str
    label: str
    mitre_tactic: str
    asset_types: tuple[AssetType, ...]
    source_tools: tuple[SourceTool, ...]


A, S = AssetType, SourceTool

CATEGORIES: dict[str, AlertCategory] = {
    c.key: c
    for c in [
        AlertCategory(
            "malware", "Malware execution", "execution", (A.ENDPOINT, A.SERVER), (S.EDR,)
        ),
        AlertCategory(
            "phishing",
            "Phishing / malicious email",
            "initial_access",
            (A.EMAIL_GATEWAY,),
            (S.EMAIL,),
        ),
        AlertCategory(
            "auth_bruteforce",
            "Authentication brute force",
            "credential_access",
            (A.DOMAIN_CONTROLLER, A.SERVER, A.CLOUD),
            (S.SIEM,),
        ),
        AlertCategory(
            "auth_anomaly",
            "Anomalous authentication",
            "credential_access",
            (A.DOMAIN_CONTROLLER, A.CLOUD),
            (S.SIEM,),
        ),
        AlertCategory(
            "privilege_escalation",
            "Privilege escalation",
            "privilege_escalation",
            (A.DOMAIN_CONTROLLER, A.SERVER),
            (S.EDR, S.SIEM),
        ),
        AlertCategory(
            "lateral_movement",
            "Lateral movement",
            "lateral_movement",
            (A.SERVER, A.ENDPOINT, A.DOMAIN_CONTROLLER),
            (S.EDR, S.IDS),
        ),
        AlertCategory(
            "c2_beacon",
            "Command-and-control beaconing",
            "command_and_control",
            (A.ENDPOINT, A.SERVER),
            (S.IDS, S.FIREWALL),
        ),
        AlertCategory(
            "data_exfiltration",
            "Data exfiltration",
            "exfiltration",
            (A.DATABASE, A.SERVER, A.CLOUD),
            (S.IDS, S.FIREWALL, S.SIEM),
        ),
        AlertCategory(
            "recon_scan",
            "Reconnaissance / scanning",
            "reconnaissance",
            (A.FIREWALL,),
            (S.FIREWALL, S.IDS),
        ),
        AlertCategory(
            "policy_violation",
            "Security policy violation",
            "defense_evasion",
            (A.ENDPOINT,),
            (S.EDR, S.SIEM),
        ),
        AlertCategory(
            "vuln_exploit",
            "Vulnerability exploitation",
            "initial_access",
            (A.SERVER, A.FIREWALL, A.DATABASE),
            (S.IDS,),
        ),
        AlertCategory(
            "web_attack",
            "Web application attack",
            "initial_access",
            (A.SERVER, A.CLOUD),
            (S.IDS, S.FIREWALL),
        ),
        AlertCategory("dos", "Denial of service", "impact", (A.FIREWALL,), (S.FIREWALL,)),
        AlertCategory(
            "ot_protocol_anomaly",
            "OT protocol anomaly",
            "discovery",
            (A.OT_SCADA, A.OT_HMI),
            (S.OT_IDS,),
        ),
        AlertCategory(
            "ot_unauthorized_command",
            "Unauthorised OT command",
            "impact",
            (A.OT_SCADA,),
            (S.OT_IDS,),
        ),
        AlertCategory(
            "insider_misuse", "Insider data misuse", "collection", (A.DATABASE, A.SERVER), (S.SIEM,)
        ),
    ]
}

# Log sources a well-monitored asset of each type should feed.
EXPECTED_SOURCES: dict[AssetType, tuple[SourceTool, ...]] = {
    A.DOMAIN_CONTROLLER: (S.SIEM, S.EDR),
    A.SERVER: (S.EDR, S.SIEM),
    A.ENDPOINT: (S.EDR,),
    A.FIREWALL: (S.FIREWALL, S.IDS),
    A.DATABASE: (S.SIEM, S.EDR),
    A.OT_SCADA: (S.OT_IDS,),
    A.OT_HMI: (S.OT_IDS, S.EDR),
    A.CLOUD: (S.SIEM,),
    A.EMAIL_GATEWAY: (S.EMAIL,),
}

OT_ASSET_TYPES = frozenset({A.OT_SCADA, A.OT_HMI})

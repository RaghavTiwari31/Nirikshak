"""Text resources for the synthetic generator: rule names, notes, entity names.

All organisation names are fictional and every generated entity is labelled synthetic.
"""

import numpy as np

RULES: dict[str, list[str]] = {
    "malware": [
        "EDR-MAL-004 Suspicious PowerShell download cradle",
        "EDR-MAL-011 Known ransomware file extension burst",
        "EDR-MAL-017 Unsigned binary executed from temp directory",
        "EDR-MAL-023 Credential dumping tool signature",
    ],
    "phishing": [
        "MAIL-PHI-002 Lookalike sender domain",
        "MAIL-PHI-007 Macro-enabled attachment",
        "MAIL-PHI-013 Credential harvesting URL",
        "MAIL-PHI-019 Reported by user",
    ],
    "auth_bruteforce": [
        "SIEM-AUTH-101 Multiple failed logons for one account",
        "SIEM-AUTH-104 Password spray across accounts",
        "SIEM-AUTH-109 Failed VPN logons from single source",
    ],
    "auth_anomaly": [
        "SIEM-AUTH-201 Logon from new country",
        "SIEM-AUTH-205 Impossible travel",
        "SIEM-AUTH-212 Service account interactive logon",
    ],
    "privilege_escalation": [
        "EDR-PRV-031 Account added to Domain Admins",
        "SIEM-PRV-044 Sensitive privilege use outside change window",
    ],
    "lateral_movement": [
        "EDR-LAT-051 Remote service creation via SMB",
        "IDS-LAT-058 Pass-the-hash pattern",
        "EDR-LAT-063 WMI remote execution",
    ],
    "c2_beacon": [
        "IDS-C2-071 Periodic beacon to rare domain",
        "FW-C2-077 Traffic to known C2 IP",
        "IDS-C2-079 DNS tunnelling heuristics",
    ],
    "data_exfiltration": [
        "IDS-EXF-081 Large outbound transfer to cloud storage",
        "SIEM-EXF-086 Bulk database export by user",
        "FW-EXF-089 Unusual upload volume off-hours",
    ],
    "recon_scan": [
        "FW-REC-091 Horizontal port scan",
        "IDS-REC-094 Vulnerability scanner signature",
        "FW-REC-097 Blocked inbound sweep",
    ],
    "policy_violation": [
        "EDR-POL-111 USB mass storage connected",
        "SIEM-POL-114 Unapproved remote-access tool",
        "EDR-POL-118 Security agent tamper attempt",
    ],
    "vuln_exploit": [
        "IDS-EXP-121 Exploit attempt against public service",
        "IDS-EXP-126 Web shell upload pattern",
        "IDS-EXP-129 Log4Shell style payload",
    ],
    "web_attack": [
        "IDS-WEB-131 SQL injection attempt",
        "FW-WEB-135 Cross-site scripting payload",
        "IDS-WEB-138 Path traversal attempt",
    ],
    "dos": ["FW-DOS-141 SYN flood threshold exceeded", "FW-DOS-144 Volumetric UDP flood"],
    "ot_protocol_anomaly": [
        "OTIDS-PRO-151 Unexpected Modbus function code",
        "OTIDS-PRO-155 New device on control network",
        "OTIDS-PRO-158 DNP3 protocol anomaly",
    ],
    "ot_unauthorized_command": [
        "OTIDS-CMD-161 PLC program download outside window",
        "OTIDS-CMD-166 Setpoint change from engineering workstation",
    ],
    "insider_misuse": [
        "SIEM-INS-171 Access to records outside role",
        "SIEM-INS-175 Mass file access before resignation date",
    ],
}

ROOT_CAUSES_TP = [
    "phishing email opened",
    "unpatched public-facing service",
    "weak password",
    "misconfigured firewall rule",
    "compromised vendor account",
    "malicious insider",
    "exposed remote-access service",
]
ROOT_CAUSES_FP = [
    "authorised admin activity",
    "vulnerability scan by IT",
    "rule too broad",
    "backup job traffic",
    "user travelling",
    "software update process",
]
REMEDIATIONS = [
    "host isolated and reimaged",
    "account disabled and password reset",
    "IOC blocked at perimeter",
    "patch applied",
    "firewall rule corrected",
    "vendor access revoked",
    "malicious email purged from mailboxes",
]

_PROCS = ["powershell.exe", "rundll32.exe", "wmic.exe", "certutil.exe", "mshta.exe", "cmd.exe"]
_PARENTS = ["winword.exe", "outlook.exe", "explorer.exe", "services.exe", "excel.exe"]

TP_SENTENCES = [
    [
        "Investigated {rule} on {host}.",
        "Triaged alert raised on {host}.",
        "Picked up {rule} for {host} from the queue.",
    ],
    [
        "Process tree shows {proc} spawned by {parent} with an outbound connection to {ip}.",
        "Logs show {user} authenticating from {ip} shortly before the activity.",
        "Correlated with firewall logs: {host} contacted {ip} {n} times in the last hour.",
    ],
    [
        "Confirmed malicious; host isolated through EDR.",
        "Activity confirmed as malicious and contained.",
        "Verdict: true positive. Containment actions initiated.",
    ],
    [
        "Hash {hash} submitted to sandbox, verdict malicious.",
        "IOCs ({ip}, {hash}) added to the blocklist.",
        "Credentials for {user} reset and sessions revoked.",
    ],
    [
        "Root cause: {root}. Remediation: {remediation}.",
        "Remediation completed ({remediation}); monitoring for recurrence.",
        "Escalated per playbook; post-incident review scheduled.",
    ],
]

FP_SENTENCES = [
    [
        "Reviewed alert for {host}.",
        "Checked {rule} on {host}.",
        "Analysed activity reported on {host}.",
    ],
    [
        "Activity traced to {root} by {user}.",
        "Matches change ticket CHG{n} raised by {user}.",
        "Source {ip} belongs to the internal vulnerability scanner.",
    ],
    [
        "No malicious indicators found.",
        "Behaviour is expected for this asset.",
        "No further suspicious activity in the surrounding logs.",
    ],
    [
        "Closing as false positive; tuning request raised.",
        "Closed as benign. Added to the known-activity list.",
        "Closing. Recommend narrowing the rule scope.",
    ],
]

# Near-identical boilerplate used by "template closer" analysts.
TEMPLATE_NOTES = [
    "Checked. No issue found. Closed.",
    "Checked alert. No issue found. Closing.",
    "Checked. No issues found. Closed.",
]

SECTOR_NAMES: dict[str, tuple[str, list[str]]] = {
    "power_energy": (
        "PWR",
        [
            "Grid Transmission Corporation",
            "Power Generation Ltd",
            "Load Dispatch Centre",
            "Hydro Power Company",
        ],
    ),
    "bfsi": ("FIN", ["Cooperative Bank", "Payments Corporation", "Clearing House", "Rural Bank"]),
    "telecom": ("TEL", ["Telecom Networks Ltd", "Broadband Services", "Fibre Backbone Corp"]),
    "transport": (
        "TRN",
        ["Metro Rail Corporation", "Port Authority", "Rail Signalling Ltd", "Airport Operations"],
    ),
    "government": (
        "GOV",
        ["e-Governance Services", "State Data Centre", "Revenue Records Directorate"],
    ),
    "strategic_public": (
        "STR",
        [
            "Strategic Materials Ltd",
            "Space Systems PSU",
            "Atomic Fuel Facility",
            "Refinery Operations",
        ],
    ),
}
REGIONS = [
    "Northern",
    "Southern",
    "Eastern",
    "Western",
    "Central",
    "Coastal",
    "Deccan",
    "Himalayan",
    "Konkan",
    "Gangetic",
    "Vindhya",
    "Malwa",
]


def fill(template: str, rng: np.random.Generator, ctx: dict[str, str]) -> str:
    extra = {
        "ip": f"{rng.integers(11, 223)}.{rng.integers(0, 255)}.{rng.integers(0, 255)}."
        f"{rng.integers(1, 254)}",
        "hash": "".join(rng.choice(list("0123456789abcdef"), 12)),
        "proc": str(rng.choice(_PROCS)),
        "parent": str(rng.choice(_PARENTS)),
        "n": str(int(rng.integers(3, 9000))),
    }
    return template.format(**extra, **ctx)


def compose_note(
    rng: np.random.Generator, *, tp: bool, ctx: dict[str, str], max_sentences: int | None = None
) -> str:
    groups = TP_SENTENCES if tp else FP_SENTENCES
    picked = [str(rng.choice(g)) for g in groups]
    if max_sentences is not None:
        picked = picked[:max_sentences]
    return " ".join(fill(s, rng, ctx) for s in picked)

"""Parsing, mapping and validation (no database)."""

from datetime import date

import pandas as pd
import pytest

from app.ingestion.contract import ALERTS, ASSETS, CASES
from app.ingestion.mapping import MappingError, apply_mapping, suggest_mapping
from app.ingestion.parsers import ParseError, detect_format, parse_bytes
from app.ingestion.validate import parse_datetime, validate_dataset


def test_parse_csv_json_ndjson() -> None:
    df, fmt = parse_bytes(b"a,b\n1,2\n3,\n", "x.csv")
    assert fmt == "csv" and df.shape == (2, 2) and df.iloc[1]["b"] == ""
    df, fmt = parse_bytes(b'{"records": [{"a": 1}, {"a": 2}]}', "x.json")
    assert fmt == "json" and len(df) == 2
    df, fmt = parse_bytes(b'{"a": 1}\n{"a": 2}\n', None)
    assert fmt == "ndjson" and len(df) == 2
    assert detect_format(None, b"[{}]") == "json"


def test_parse_rejects_empty_and_duplicate_columns() -> None:
    with pytest.raises(ParseError):
        parse_bytes(b"   ", "x.csv")
    with pytest.raises(ParseError, match="Duplicate"):
        parse_bytes(b"a,a\n1,2\n", "x.csv")


def test_suggest_mapping_handles_vendor_headers() -> None:
    cols = [
        "Alert ID",
        "Host Name",
        "Source",
        "Rule Name",
        "Alert Type",
        "Severity Level",
        "Created At (IST)",
        "Ack Time",
        "Closed Time",
        "Verdict",
        "Ticket ID",
        "Handled By",
        "Comments",
    ]
    m = suggest_mapping(cols, ALERTS)
    assert m["alert_ref"] == "Alert ID"
    assert m["asset_ref"] == "Host Name"
    assert m["created_at"] == "Created At (IST)"
    assert m["closed_at"] == "Closed Time"
    assert m["disposition"] == "Verdict"
    assert m["analyst"] == "Handled By"
    assert "Comments" not in m.values()
    assert len(set(m.values())) == len(m)


def test_apply_mapping_validates() -> None:
    df = pd.DataFrame({"x": [1], "y": [2]})
    with pytest.raises(MappingError, match="not in file"):
        apply_mapping(df, {"alert_ref": "nope"}, ALERTS)
    with pytest.raises(MappingError, match="only one field"):
        apply_mapping(df, {"alert_ref": "x", "rule_ref": "x"}, ALERTS)


def test_parse_datetime_timezones() -> None:
    s = pd.Series(
        [
            "2026-03-04T10:00:00Z",
            "2026-03-04 15:30:00",
            "04/03/2026 15:30",
            "2026-03-04T10:00:00+05:30",
            "garbage",
            "",
        ]
    )
    out = parse_datetime(s, "Asia/Kolkata")
    assert out[0] == pd.Timestamp("2026-03-04T10:00:00Z")
    assert out[1] == pd.Timestamp("2026-03-04T10:00:00Z")  # naive -> IST -> UTC
    assert out[2] == pd.Timestamp("2026-03-04T10:00:00Z")  # day-first fallback
    assert out[3] == pd.Timestamp("2026-03-04T04:30:00Z")
    assert pd.isna(out[4]) and pd.isna(out[5])


def _alerts(**overrides: list[object]) -> pd.DataFrame:
    base: dict[str, list[object]] = {
        "alert_ref": ["a1", "a2", "a3", "a4"],
        "source_tool": ["edr", "EDR", "firewall", "edr"],
        "rule_ref": ["r", "r", "r", "r"],
        "category": ["malware", "malware", "recon_scan", "weird_new_thing"],
        "severity": ["High", "crit", "Urgent", "low"],
        "created_at": ["2026-01-05T10:00:00Z"] * 4,
        "closed_at": ["2026-01-05T11:00:00Z", "2026-01-04T00:00:00Z", "", ""],
        "disposition": ["True Positive", "fp", "", ""],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_validate_alerts_rejects_and_warns() -> None:
    clean, report = validate_dataset(
        _alerts(), ALERTS, period=(date(2026, 1, 1), date(2026, 1, 31))
    )
    assert report.rows_received == 4
    assert report.errors["invalid severity"] == 1  # "Urgent"
    assert report.errors["closed before created"] == 1  # a2
    assert report.warnings["unrecognised category"] == 1
    assert report.rows_accepted == 2 and report.rows_rejected == 2
    row = clean.set_index("alert_ref").loc["a1"]
    assert row.severity == "high" and row.disposition == "tp" and row.source_tool == "edr"
    assert clean.set_index("alert_ref").loc["a4"].disposition == "open"
    assert report.samples and all("record" in s for s in report.samples)


def test_validate_missing_required_column_is_fatal() -> None:
    _, report = validate_dataset(pd.DataFrame({"alert_ref": ["x"]}), ALERTS)
    assert report.fatal and "created_at" in report.fatal and report.rows_rejected == 1


def test_validate_duplicates_and_period_and_types() -> None:
    raw = pd.DataFrame(
        {
            "asset_ref": ["h1", "h1", "h2"],
            "asset_type": ["server", "server", "dc"],
            "environment": ["it", "it", "it"],
            "criticality": ["3", "4", "9"],
            "expected_sources": ["edr;siem", "edr", "siem|bogus"],
        }
    )
    clean, report = validate_dataset(raw, ASSETS)
    assert report.errors["criticality must be 1-4"] == 1
    assert report.rows_accepted == 1
    assert clean.iloc[0].criticality == 4  # duplicate: last one kept
    assert any("duplicate" in k for k in report.warnings)

    cases = pd.DataFrame(
        {
            "case_ref": ["c1"],
            "opened_at": ["2026-02-10T00:00:00Z"],
            "priority": ["high"],
            "status": ["open"],
            "escalation_level": ["l2"],
        }
    )
    clean, report = validate_dataset(cases, CASES, period=(date(2026, 1, 1), date(2026, 1, 31)))
    assert report.warnings["outside submission period"] == 1
    assert bool(clean.iloc[0].escalated) is True  # inferred from escalation_level

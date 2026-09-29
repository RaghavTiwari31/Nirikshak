"""Type conversion, validation and the per-dataset data-quality report.

Rows that break the contract are rejected with a reason; recoverable problems are
accepted with a warning. Every count ends up in the submission's DQ report, so
supervisors can see how trustworthy each submission is.
"""

import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd

from app.ingestion.contract import ENUM_ALIASES, DatasetSpec, FieldSpec

NULL_TOKENS = {"", "null", "none", "nan", "n/a", "na", "-", "nat"}
TZ_SUFFIX = re.compile(r"(?:Z|[+-]\d{2}:?\d{2})$")
MAX_SAMPLES = 25
ACK_SKEW_TOLERANCE = pd.Timedelta(seconds=60)


@dataclass
class DatasetReport:
    dataset: str
    rows_received: int = 0
    rows_accepted: int = 0
    rows_rejected: int = 0
    errors: Counter[str] = field(default_factory=Counter)
    warnings: Counter[str] = field(default_factory=Counter)
    samples: list[dict[str, Any]] = field(default_factory=list)
    null_rates: dict[str, float] = field(default_factory=dict)
    time_range: dict[str, str | None] = field(default_factory=dict)
    fatal: str | None = None

    def warn(self, issue: str, count: int = 1) -> None:
        if count:
            self.warnings[issue] += count

    def sample(self, level: str, issue: str, index: pd.Index) -> None:
        for i in index[: max(0, 3 - sum(s["issue"] == issue for s in self.samples))]:
            if len(self.samples) >= MAX_SAMPLES:
                return
            self.samples.append({"record": int(i) + 1, "level": level, "issue": issue})

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset": self.dataset,
            "rows_received": self.rows_received,
            "rows_accepted": self.rows_accepted,
            "rows_rejected": self.rows_rejected,
            "errors": dict(self.errors.most_common()),
            "warnings": dict(self.warnings.most_common()),
            "samples": self.samples,
            "null_rates": self.null_rates,
            "time_range": self.time_range,
            "fatal": self.fatal,
        }


def _norm_token(s: pd.Series) -> pd.Series:
    return s.str.lower().str.strip().str.replace(r"[\s\-]+", "_", regex=True)


def clean_strings(s: pd.Series) -> pd.Series:
    out = s.astype("string").str.strip()
    return out.mask(out.str.lower().isin(NULL_TOKENS))


def parse_datetime(s: pd.Series, assume_tz: str) -> pd.Series:
    """Parse to UTC. Timestamps without an offset are taken to be in `assume_tz`."""
    if isinstance(s.dtype, pd.DatetimeTZDtype):
        return s.dt.tz_convert("UTC")
    if pd.api.types.is_datetime64_dtype(s):
        return s.dt.tz_localize(assume_tz, ambiguous="NaT", nonexistent="NaT").dt.tz_convert("UTC")

    st = clean_strings(s)
    out = pd.Series(pd.NaT, index=s.index, dtype="datetime64[ns, UTC]")
    has_tz = st.str.contains(TZ_SUFFIX, na=False)
    if has_tz.any():
        out[has_tz] = pd.to_datetime(st[has_tz], utc=True, errors="coerce", format="ISO8601")
    naive = st.notna() & ~has_tz
    if naive.any():
        parsed = _parse_naive(st[naive])
        localized = parsed.dt.tz_localize(assume_tz, ambiguous="NaT", nonexistent="NaT")
        out[naive] = localized.dt.tz_convert("UTC")
    return out


def _parse_naive(st: pd.Series) -> pd.Series:
    """ISO 8601 first; anything else falls back to a day-first flexible parse (dd/mm/yyyy)."""
    parsed = pd.to_datetime(st, errors="coerce", format="ISO8601")
    failed = parsed.isna() & st.notna()
    if failed.any():
        parsed[failed] = pd.to_datetime(st[failed], errors="coerce", format="mixed", dayfirst=True)
    return parsed


def _to_numeric(s: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        return pd.to_numeric(s, errors="coerce")
    values = clean_strings(s).to_numpy(dtype=object, na_value=None)
    return pd.to_numeric(pd.Series(values, index=s.index), errors="coerce")


def _convert(s: pd.Series, spec: FieldSpec, assume_tz: str) -> pd.Series:
    kind = spec.kind
    if kind == "datetime":
        return parse_datetime(s, assume_tz)
    if kind == "date":
        if pd.api.types.is_datetime64_any_dtype(s):
            vals = s.dt.tz_localize(None) if isinstance(s.dtype, pd.DatetimeTZDtype) else s
        elif s.map(lambda v: isinstance(v, date)).any():
            vals = pd.to_datetime(s, errors="coerce")
        else:
            vals = _parse_naive(clean_strings(s))
        return vals.dt.normalize()
    if kind in ("int", "float"):
        num = _to_numeric(s)
        if kind == "int":
            num = num.where(num.isna() | (num % 1 == 0))
            return num.astype("Int64")
        return num.astype("Float64")
    if kind == "bool":
        if pd.api.types.is_bool_dtype(s):
            return s.astype("boolean")
        mapping = {
            "true": True,
            "t": True,
            "yes": True,
            "y": True,
            "1": True,
            "false": False,
            "f": False,
            "no": False,
            "n": False,
            "0": False,
        }
        return _norm_token(clean_strings(s.astype(str))).map(mapping).astype("boolean")
    if kind == "enum":
        tokens = _norm_token(clean_strings(s))
        aliases = ENUM_ALIASES.get(spec.name, {})
        tokens = tokens.replace(aliases) if aliases else tokens
        if spec.open_enum:
            return tokens
        return tokens.where(tokens.isin(spec.enum or ()))
    if kind == "list":

        def split(v: object) -> list[str] | None:
            if v is None or v is pd.NA or (isinstance(v, float) and pd.isna(v)):
                return None
            items = v if isinstance(v, list) else re.split(r"[;|,]", str(v))
            vals = [str(x).strip().lower() for x in items if str(x).strip()]
            return [x for x in vals if spec.enum is None or x in spec.enum] or None

        return s.map(split)
    # str / text
    out = clean_strings(s)
    return out


def validate_dataset(
    raw: pd.DataFrame,
    spec: DatasetSpec,
    *,
    assume_tz: str = "Asia/Kolkata",
    period: tuple[date, date] | None = None,
) -> tuple[pd.DataFrame, DatasetReport]:
    report = DatasetReport(dataset=spec.key, rows_received=len(raw))
    missing_cols = [f for f in spec.required_fields if f not in raw.columns]
    if missing_cols:
        report.fatal = f"Missing required columns: {', '.join(missing_cols)}"
        report.rows_rejected = len(raw)
        return pd.DataFrame(columns=[f.name for f in spec.fields]), report

    df = raw.reset_index(drop=True)
    out = pd.DataFrame(index=df.index)
    rejected = pd.Series(False, index=df.index)

    def reject(mask: pd.Series, issue: str) -> None:
        nonlocal rejected
        new = mask.fillna(False).astype(bool) & ~rejected
        if new.any():
            report.errors[issue] += int(new.sum())
            report.sample("error", issue, df.index[new])
            rejected |= new

    def warn(mask: pd.Series, issue: str) -> None:
        m = mask.fillna(False).astype(bool) & ~rejected
        if m.any():
            report.warn(issue, int(m.sum()))
            report.sample("warning", issue, df.index[m])

    for f in spec.fields:
        # Absent optional columns still go through conversion so every output column is typed.
        src = (
            df[f.name] if f.name in df.columns else pd.Series(pd.NA, index=df.index, dtype="string")
        )
        if src.dtype == object or pd.api.types.is_string_dtype(src):
            present = src.notna() & ~src.astype("string").str.strip().str.lower().isin(NULL_TOKENS)
        else:  # already typed (e.g. from the generator or JSON numbers)
            present = src.notna()
        conv = _convert(src, f, assume_tz)
        invalid = present & conv.isna()
        if f.required:
            reject(~present, f"missing {f.name}")
            reject(invalid, f"invalid {f.name}")
        else:
            warn(invalid, f"invalid {f.name} (left empty)")
        if f.kind == "enum" and f.open_enum and f.enum:
            warn(conv.notna() & ~conv.isin(f.enum), f"unrecognised {f.name}")
        if f.max_len and f.kind in ("str", "text"):
            too_long = conv.str.len() > f.max_len
            warn(too_long, f"{f.name} truncated to {f.max_len} chars")
            conv = conv.str.slice(0, f.max_len)
        out[f.name] = conv

    _apply_rules(spec.key, out, reject, warn)

    if spec.time_field and period is not None:
        # A submission period is a local calendar range (e.g. an IST month), not a UTC one.
        start = pd.Timestamp(period[0], tz=assume_tz)
        end = pd.Timestamp(period[1], tz=assume_tz) + pd.Timedelta(days=1)
        ts = out[spec.time_field]
        if ts.dt.tz is None:
            ts = ts.dt.tz_localize(assume_tz)
        warn((ts < start) | (ts >= end), "outside submission period")

    kept = out[~rejected]
    dupes = kept.duplicated(subset=list(spec.natural_key), keep="last")
    if dupes.any():
        issue = f"duplicate {'+'.join(spec.natural_key)} (kept last)"
        report.warn(issue, int(dupes.sum()))
        report.sample("warning", issue, kept.index[dupes])
        kept = kept[~dupes]

    report.rows_rejected = int(rejected.sum())
    report.rows_accepted = len(kept)
    if len(kept):
        report.null_rates = {
            f.name: round(float(kept[f.name].isna().mean()), 4)
            for f in spec.fields
            if not f.required
        }
        if spec.time_field:
            tf = kept[spec.time_field].dropna()
            report.time_range = {
                "min": tf.min().isoformat() if len(tf) else None,
                "max": tf.max().isoformat() if len(tf) else None,
            }
    return kept.reset_index(drop=True), report


def _apply_rules(dataset: str, out: pd.DataFrame, reject: Any, warn: Any) -> None:
    now = pd.Timestamp(datetime.now(UTC) + timedelta(days=1))
    if dataset == "alerts":
        reject(out["created_at"] > now, "timestamp in the future")
        reject(out["closed_at"] < out["created_at"], "closed before created")
        early_ack = out["acknowledged_at"] < out["created_at"] - ACK_SKEW_TOLERANCE
        warn(early_ack, "acknowledged before created (ack cleared)")
        out.loc[early_ack.fillna(False), "acknowledged_at"] = pd.NaT
        no_disp = out["disposition"].isna()
        warn(no_disp & out["closed_at"].notna(), "closed without disposition")
        warn((out["disposition"] == "open") & out["closed_at"].notna(), "closed alert marked open")
        out.loc[no_disp & out["closed_at"].isna(), "disposition"] = "open"
    elif dataset == "cases":
        reject(out["opened_at"] > now, "timestamp in the future")
        reject(out["closed_at"] < out["opened_at"], "closed before opened")
        warn((out["status"] == "closed") & out["closed_at"].isna(), "closed case without closed_at")
        esc = out["escalated"].astype("boolean")
        out["escalated"] = esc.fillna(out["escalation_level"].notna())
        out["reopened_count"] = out["reopened_count"].fillna(0)
    elif dataset == "assets":
        reject(~out["criticality"].between(1, 4), "criticality must be 1-4")
    elif dataset == "source_volume":
        reject(out["event_count"] < 0, "negative event_count")
    elif dataset == "entity_profile":
        bad = ~out["declared_coverage_pct"].between(0, 100) & out["declared_coverage_pct"].notna()
        warn(bad, "declared_coverage_pct outside 0-100 (left empty)")
        out.loc[bad.fillna(False), "declared_coverage_pct"] = pd.NA
        out["declared_24x7"] = out["declared_24x7"].astype("boolean").fillna(False)

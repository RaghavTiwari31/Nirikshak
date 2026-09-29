"""Parse uploaded submission files into DataFrames of raw values."""

import csv
import io
import json
from collections import Counter
from typing import Literal

import pandas as pd

SourceFormat = Literal["csv", "json", "ndjson"]
MAX_ROWS = 500_000


class ParseError(ValueError):
    pass


def detect_format(filename: str | None, content: bytes) -> SourceFormat:
    name = (filename or "").lower()
    if name.endswith(".csv"):
        return "csv"
    if name.endswith((".ndjson", ".jsonl")):
        return "ndjson"
    if name.endswith(".json"):
        return "json"
    head = content.lstrip()[:1]
    if head == b"[":
        return "json"
    if head == b"{":
        # A JSON object spanning the whole file vs. one object per line.
        first_line = content.lstrip().split(b"\n", 1)[0].strip()
        try:
            json.loads(first_line)
            return "ndjson" if b"\n" in content.strip() else "json"
        except ValueError:
            return "json"
    return "csv"


def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ParseError("Could not decode file; save it as UTF-8")


def _records_from_json(obj: object) -> list[dict[str, object]]:
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        lists = [v for v in obj.values() if isinstance(v, list)]
        if len(lists) == 1:
            return lists[0]
        raise ParseError("JSON object must contain exactly one array of records")
    raise ParseError("JSON must be an array of records")


def parse_bytes(content: bytes, filename: str | None = None) -> tuple[pd.DataFrame, SourceFormat]:
    if not content.strip():
        raise ParseError("File is empty")
    fmt = detect_format(filename, content)
    text = _decode(content)
    try:
        if fmt == "csv":
            # pandas silently renames duplicate headers (a, a.1), so check the raw header row.
            header = next(csv.reader(io.StringIO(text)), [])
            _check_duplicates([h.strip() for h in header])
            df = pd.read_csv(
                io.StringIO(text), dtype=str, keep_default_na=False, skipinitialspace=True
            )
        elif fmt == "json":
            df = pd.DataFrame.from_records(_records_from_json(json.loads(text)))
        else:
            rows = [json.loads(line) for line in text.splitlines() if line.strip()]
            df = pd.DataFrame.from_records(rows)
    except (ValueError, pd.errors.ParserError) as exc:
        raise ParseError(f"Could not parse {fmt.upper()}: {exc}") from exc

    if len(df) > MAX_ROWS:
        raise ParseError(f"File has {len(df):,} rows; the limit per upload is {MAX_ROWS:,}")
    df.columns = [str(c).strip() for c in df.columns]
    _check_duplicates(list(df.columns))
    return df, fmt


def _check_duplicates(columns: list[str]) -> None:
    dupes = sorted(c for c, n in Counter(columns).items() if n > 1)
    if dupes:
        raise ParseError(f"Duplicate column names: {', '.join(dupes)}")

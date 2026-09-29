"""Map an entity's export columns onto the canonical contract."""

import difflib
import re

import pandas as pd

from app.ingestion.contract import DatasetSpec


class MappingError(ValueError):
    pass


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def suggest_mapping(columns: list[str], spec: DatasetSpec) -> dict[str, str]:
    """Best-guess {canonical_field: source_column}. Each source column is used at most once."""
    by_norm = {_norm(c): c for c in columns}
    used: set[str] = set()
    mapping: dict[str, str] = {}

    # Required fields claim their columns first, then exact matches before fuzzy ones.
    ordered = sorted(spec.fields, key=lambda f: not f.required)
    for fuzzy in (False, True):
        for f in ordered:
            if f.name in mapping:
                continue
            candidates = [_norm(f.name), *(_norm(s) for s in f.synonyms)]
            available = [n for n in by_norm if by_norm[n] not in used]
            match: str | None = next((c for c in candidates if c in available), None)
            if match is None and fuzzy:
                for cand in candidates:
                    close = difflib.get_close_matches(cand, available, n=1, cutoff=0.84)
                    if close:
                        match = close[0]
                        break
            if match is not None:
                mapping[f.name] = by_norm[match]
                used.add(by_norm[match])
    return mapping


def apply_mapping(df: pd.DataFrame, mapping: dict[str, str], spec: DatasetSpec) -> pd.DataFrame:
    """Return a frame with canonical column names only. Unmapped optional fields are absent."""
    unknown_targets = set(mapping) - set(spec.fields_by_name)
    if unknown_targets:
        raise MappingError(f"Unknown fields for {spec.key}: {', '.join(sorted(unknown_targets))}")
    sources = list(mapping.values())
    if len(set(sources)) != len(sources):
        raise MappingError("Each source column can be mapped to only one field")
    missing_sources = {src for src in sources if src not in df.columns}
    if missing_sources:
        raise MappingError(f"Columns not in file: {', '.join(sorted(missing_sources))}")
    return df[list(mapping.values())].rename(columns={v: k for k, v in mapping.items()})

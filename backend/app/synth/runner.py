"""Generate the synthetic dataset and push it through the real ingestion pipeline."""

import json
import logging
import multiprocessing
import time
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.audit.chain import append_audit
from app.ingestion.contract import DATASETS
from app.ingestion.parsers import parse_bytes
from app.ingestion.pipeline import ingest_bundle, upsert_entity_profiles
from app.models.analysis import SyntheticTruth
from app.models.entities import Entity
from app.synth.archetypes import ARCHETYPES
from app.synth.generator import (
    IST,
    EntityData,
    EntityGenerator,
    EntitySpec,
    entity_specs,
    generation_start,
    split_by_month,
)

logger = logging.getLogger(__name__)

EVIDENCE_TABLES = (
    "entity",
    "submission",
    "asset",
    "alert",
    "case_record",
    "case_event",
    "escalation",
    "source_volume",
    "column_mapping",
    "analysis_run",
    "synthetic_truth",
)


@dataclass
class SynthSummary:
    entities: int
    submissions: int
    rows: dict[str, int]
    seconds: float


def reset_evidence(db: Session) -> None:
    """Remove all submitted evidence and analysis output. Users and the audit log are kept."""
    db.execute(text(f"TRUNCATE {', '.join(EVIDENCE_TABLES)} RESTART IDENTITY CASCADE"))


def _profiles(datas: list[EntityData]) -> pd.DataFrame:
    return pd.DataFrame([d.profile for d in datas])


def _write_truth(db: Session, data: EntityData) -> None:
    entity_id = db.scalar(select(Entity.id).where(Entity.code == data.spec.code))
    arch = ARCHETYPES[data.spec.archetype]
    stmt = insert(SyntheticTruth).values(
        entity_id=entity_id,
        archetype=arch.key,
        planted_signals=data.planted_signals,
        severity=arch.severity,
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["entity_id"],
            set_={
                "archetype": arch.key,
                "planted_signals": data.planted_signals,
                "severity": arch.severity,
            },
        )
    )


@dataclass
class _EntityResult:
    line: str
    submissions: int
    rows: dict[str, int]
    summary: EntityData  # stripped: profile + truth only


def _process_entity(
    spec: EntitySpec, start: date, months: int, load: bool, out_dir: Path | None
) -> _EntityResult:
    """Generate one entity and ingest it. Runs in a worker process when workers > 1."""
    from app.core.db import SessionLocal

    data = EntityGenerator(spec, start, months).generate()
    bundles = split_by_month(data, start, months)
    rows: dict[str, int] = {}
    if load:
        with SessionLocal() as db:
            upsert_entity_profiles(db, _profiles([data]))  # declared posture needs the data
            _write_truth(db, data)
            db.commit()
            for period_start, period_end, frames in bundles:
                sub = ingest_bundle(
                    db,
                    entity_code=spec.code,
                    period_start=period_start,
                    period_end=period_end,
                    frames=frames,
                    source_format="synthetic",
                    actor="synth",
                    received_at=pd.Timestamp(period_end, tz=IST) + pd.Timedelta(days=5),
                )
                # One transaction per submission: atomic, and keeps the audit lock short.
                db.commit()
                for k, v in sub.row_counts_json.items():
                    rows[k] = rows.get(k, 0) + v
    if out_dir is not None:
        _write_entity_files(out_dir, data, bundles)
    line = (
        f"{spec.code:<12} {spec.archetype:<18} alerts={len(data.alerts):>6} "
        f"cases={len(data.cases):>5}"
    )
    return _EntityResult(line, len(bundles) if load else 0, rows, _strip(data))


def generate(
    db: Session | None,
    *,
    n_entities: int = 40,
    months: int = 12,
    seed: int = 2026,
    start: date | None = None,
    out_dir: Path | None = None,
    load: bool = True,
    reset: bool = False,
    workers: int = 1,
    intensity_scale: float = 1.0,
    progress: Callable[[str], None] | None = None,
) -> SynthSummary:
    t0 = time.perf_counter()
    start = generation_start(start, months)
    specs = entity_specs(n_entities, seed, intensity_scale)
    say = progress or (lambda _msg: None)
    if load and db is None:
        raise ValueError("A database session is required when load=True")

    if load and db is not None:
        if reset:
            reset_evidence(db)
        # Register every entity up front; declared posture is refined once its data exists.
        upsert_entity_profiles(db, pd.DataFrame([_profile_stub(s) for s in specs]))
        db.commit()

    rows: dict[str, int] = {}
    submissions = 0
    results: list[_EntityResult] = []

    def collect(res: _EntityResult) -> None:
        nonlocal submissions
        results.append(res)
        submissions += res.submissions
        for k, v in res.rows.items():
            rows[k] = rows.get(k, 0) + v
        say(f"[{len(results)}/{len(specs)}] {res.line}")

    if workers <= 1:
        for spec in specs:
            collect(_process_entity(spec, start, months, load, out_dir))
    else:
        # Entities are independent and seeded individually, so output is identical either way.
        # "spawn" on every OS: a forked worker would inherit the parent's pooled DB connections.
        ctx = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as pool:
            futures = [pool.submit(_process_entity, s, start, months, load, out_dir) for s in specs]
            for fut in as_completed(futures):
                collect(fut.result())
    datas_for_files = sorted((r.summary for r in results), key=lambda d: d.spec.code)

    if out_dir is not None:
        _profiles(datas_for_files).to_csv(out_dir / "entity_profiles.csv", index=False)
        truth = {
            d.spec.code: {"archetype": d.spec.archetype, "planted": d.planted_signals}
            for d in datas_for_files
        }
        (out_dir / "truth.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
        _write_messy_sample(out_dir, specs, start, months)

    if load and db is not None:
        append_audit(
            db,
            actor="synth",
            action="synth.generate",
            payload={
                "entities": n_entities,
                "months": months,
                "seed": seed,
                "start": start.isoformat(),
                "rows": rows,
            },
        )
        db.commit()
    return SynthSummary(len(specs), submissions, rows, time.perf_counter() - t0)


def _profile_stub(s: EntitySpec) -> dict[str, object]:
    return {
        "entity_code": s.code,
        "display_name": s.display_name,
        "sector": s.sector,
        "size_tier": s.size_tier,
        "soc_model": s.soc_model,
        "declared_24x7": False,
    }


def _strip(data: EntityData) -> EntityData:
    """Keep only what the summary files need, so memory stays flat across entities."""
    empty = pd.DataFrame()
    return EntityData(
        data.spec,
        data.profile,
        empty,
        empty,
        empty,
        empty,
        empty,
        empty,
        data.planted_signals,
        data.skipped_months,
    )


def _to_csv_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in out.columns:
        s = out[col]
        if isinstance(s.dtype, pd.DatetimeTZDtype):
            out[col] = s.dt.tz_convert(IST).map(lambda v: v.isoformat() if pd.notna(v) else "")
        elif s.map(lambda v: isinstance(v, list)).any():
            out[col] = s.map(lambda v: ";".join(v) if isinstance(v, list) else "")
    return out


def _write_entity_files(
    out_dir: Path, data: EntityData, bundles: list[tuple[date, date, dict[str, pd.DataFrame]]]
) -> None:
    for period_start, _end, frames in bundles:
        month_dir = out_dir / data.spec.code / period_start.strftime("%Y-%m")
        month_dir.mkdir(parents=True, exist_ok=True)
        for key, df in frames.items():
            _to_csv_frame(df).to_csv(month_dir / f"{key}.csv", index=False)


MESSY_HEADERS = {
    "alert_ref": "Alert ID",
    "asset_ref": "Host Name",
    "source_tool": "Source",
    "rule_ref": "Rule Name",
    "category": "Alert Type",
    "severity": "Severity Level",
    "created_at": "Created At (IST)",
    "acknowledged_at": "Ack Time",
    "closed_at": "Closed Time",
    "disposition": "Verdict",
    "case_ref": "Ticket ID",
    "analyst": "Handled By",
}


def _write_messy_sample(out_dir: Path, specs: list[EntitySpec], start: date, months: int) -> None:
    """A realistic 'vendor export' with odd headers and data-quality problems, for demos."""
    spec = next((s for s in specs if s.archetype != "healthy"), specs[0])
    data = EntityGenerator(spec, start, min(months, 2)).generate()
    df = data.alerts[[c for c in MESSY_HEADERS]].head(400).copy()
    rng = np.random.default_rng(7)
    local = df.created_at.dt.tz_convert(IST)
    df["created_at"] = local.dt.strftime("%d/%m/%Y %H:%M")
    for col in ("acknowledged_at", "closed_at"):
        df[col] = df[col].dt.tz_convert(IST).dt.strftime("%Y-%m-%d %H:%M:%S").fillna("")
    df["severity"] = df.severity.str.title()
    df["disposition"] = df.disposition.map(
        {
            "tp": "True Positive",
            "fp": "False Positive",
            "benign": "Benign",
            "dup": "Duplicate",
            "open": "Open",
        }
    )
    idx = rng.choice(len(df), 12, replace=False)
    df.iloc[idx[:3], df.columns.get_loc("severity")] = "Urgent"
    df.iloc[idx[3:5], df.columns.get_loc("created_at")] = ""
    df.iloc[idx[5:7], df.columns.get_loc("closed_at")] = "2020-01-01 00:00:00"
    df.iloc[idx[7:9], df.columns.get_loc("severity")] = "P1"
    dupes = df.iloc[idx[9:12]].copy()
    df = pd.concat([df, dupes], ignore_index=True)
    df["Comments"] = ""
    df = df.rename(columns=MESSY_HEADERS)
    samples = out_dir / "samples"
    samples.mkdir(parents=True, exist_ok=True)
    df.to_csv(samples / f"{spec.code}_vendor_export_alerts.csv", index=False)
    _to_csv_frame(data.assets).to_csv(samples / f"{spec.code}_assets.csv", index=False)


def ingest_directory(
    db: Session, root: Path, *, actor: str = "cli", progress: Callable[[str], None] | None = None
) -> int:
    """Load a directory written by `synth --out` (or laid out the same way)."""
    say = progress or (lambda _msg: None)
    profiles = root / "entity_profiles.csv"
    if profiles.exists():
        df, _ = parse_bytes(profiles.read_bytes(), profiles.name)
        upsert_entity_profiles(db, df)
        db.commit()
    count = 0
    for entity_dir in sorted(p for p in root.iterdir() if p.is_dir() and p.name != "samples"):
        for month_dir in sorted(p for p in entity_dir.iterdir() if p.is_dir()):
            period_start = date.fromisoformat(f"{month_dir.name}-01")
            period_end = (pd.Timestamp(period_start) + pd.offsets.MonthEnd(0)).date()
            frames = {}
            for key in DATASETS:
                path = month_dir / f"{key}.csv"
                if path.exists():
                    frames[key], _ = parse_bytes(path.read_bytes(), path.name)
            ingest_bundle(
                db,
                entity_code=entity_dir.name,
                period_start=period_start,
                period_end=period_end,
                frames=frames,
                source_format="csv",
                actor=actor,
            )
            count += 1
        db.commit()
        say(f"loaded {entity_dir.name}")
    return count

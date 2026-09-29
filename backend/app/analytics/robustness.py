"""Robustness study: does the frozen signal library hold up on data it was never tuned on?

Each configuration generates a fresh 40-entity dataset (a different seed and/or weaker
planted behaviour) in a scratch database, analyses it with the current configuration, and
scores the result against that dataset's own planted truth. The scratch database is fully
separate from the working one; only the scored results are written back.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psycopg
from sqlalchemy.engine import make_url

from app.analytics.config import load_config
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models.analysis import ValidationStudy

BACKEND_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class StudyConfig:
    seed: int
    intensity_scale: float

    @classmethod
    def parse(cls, text: str) -> "StudyConfig":
        seed, _, scale = text.partition(":")
        return cls(int(seed), float(scale or 1.0))


def _scratch_url(name: str) -> str:
    url = make_url(get_settings().database_url)
    return url.set(database=name).render_as_string(hide_password=False)


def _ensure_database(name: str) -> None:
    # The name is interpolated into CREATE DATABASE, so only allow a plain identifier.
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", name):
        raise ValueError(f"Invalid scratch database name: {name!r}")
    admin = make_url(get_settings().database_url).set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{name}"')


def _run(args: list[str], env: dict[str, str]) -> None:
    result = subprocess.run(
        [sys.executable, *args], cwd=BACKEND_DIR, env=env, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed:\n{result.stderr[-2000:]}")


def run_study(
    configs: list[StudyConfig],
    *,
    scratch_db: str = "satsa_robust",
    entities: int = 40,
    months: int = 12,
    workers: int = 4,
    progress: Callable[[str], None] | None = None,
) -> str:
    say = progress or (lambda _m: None)
    batch = uuid.uuid4().hex[:12]
    _ensure_database(scratch_db)
    url = _scratch_url(scratch_db)
    env = {**os.environ, "DATABASE_URL": url}
    _run(["-m", "alembic", "-x", f"url={url}", "upgrade", "head"], env)
    cfg_sha = load_config().sha256

    for cfg in configs:
        say(f"seed {cfg.seed}, intensity x{cfg.intensity_scale}: generating…")
        _run(
            [
                "-m",
                "app.cli",
                "synth",
                "--reset",
                "--entities",
                str(entities),
                "--months",
                str(months),
                "--seed",
                str(cfg.seed),
                "--intensity-scale",
                str(cfg.intensity_scale),
                "--workers",
                str(workers),
            ],
            env,
        )
        say("  analysing…")
        _run(["-m", "app.cli", "analyze"], env)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "eval.json"
            _run(["-m", "app.cli", "evaluate", "--json", str(out)], env)
            results: dict[str, Any] = json.loads(out.read_text(encoding="utf-8"))
        with SessionLocal() as db:
            db.add(
                ValidationStudy(
                    batch=batch,
                    seed=cfg.seed,
                    intensity_scale=cfg.intensity_scale,
                    config_sha256=cfg_sha,
                    results_json=results,
                )
            )
            db.commit()
        e = results["evaluation"]
        say(
            f"  caught {e['weak_caught']}/{e['weak_entities']}, healthy flagged "
            f"{len(e['healthy_flagged'])}/{e['healthy_entities']}, "
            f"macro recall {e['macro_recall']}, NDCG@10 {e['ndcg_at_10']}"
        )
    return batch

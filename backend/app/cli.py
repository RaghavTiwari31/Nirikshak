"""SAT-SA command line.

    python -m app.cli create-user --username admin --role admin
    python -m app.cli verify-audit
    python -m app.cli synth --entities 40 --months 12 --seed 2026 --reset
    python -m app.cli synth --entities 40 --out ../data/synth --no-load
    python -m app.cli ingest-dir ../data/synth
    python -m app.cli ingest --entity CSE-PWR-01 --dataset alerts --file alerts.csv \
        --period-start 2026-01-01 --period-end 2026-01-31

Later phases add: analyze, validate.
"""

import argparse
import getpass
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.audit.chain import append_audit, verify_chain
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.ingestion.contract import DATASETS, LOAD_ORDER
from app.ingestion.mapping import apply_mapping, suggest_mapping
from app.ingestion.parsers import parse_bytes
from app.ingestion.pipeline import IngestError, ingest_bundle, upsert_entity_profiles
from app.models.enums import UserRole
from app.models.system import AppUser


def cmd_create_user(args: argparse.Namespace) -> int:
    password = args.password or getpass.getpass("Password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        if db.scalar(select(AppUser).where(AppUser.username == args.username)):
            print(f"User '{args.username}' already exists", file=sys.stderr)
            return 1
        user = AppUser(
            username=args.username,
            display_name=args.display_name or args.username,
            pw_hash=hash_password(password),
            role=args.role,
        )
        db.add(user)
        db.flush()
        append_audit(
            db,
            actor="cli",
            action="user.create",
            object_ref=f"user:{user.id}",
            payload={"username": user.username, "role": user.role},
        )
        db.commit()
    print(f"Created {args.role} '{args.username}'")
    return 0


def cmd_verify_audit(_: argparse.Namespace) -> int:
    with SessionLocal() as db:
        result = verify_chain(db)
    if result.ok:
        print(f"Audit chain OK ({result.checked} entries)")
        return 0
    print(f"Audit chain BROKEN at id={result.first_broken_id}: {result.reason}", file=sys.stderr)
    return 2


def cmd_synth(args: argparse.Namespace) -> int:
    from app.synth.runner import generate

    out_dir = Path(args.out).resolve() if args.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
    load = not args.no_load
    with SessionLocal() as db:
        summary = generate(
            db if load else None,
            n_entities=args.entities,
            months=args.months,
            seed=args.seed,
            start=date.fromisoformat(args.start) if args.start else None,
            out_dir=out_dir,
            load=load,
            reset=args.reset,
            workers=args.workers,
            intensity_scale=args.intensity_scale,
            progress=print,
        )
    print(
        f"\nGenerated {summary.entities} entities, {summary.submissions} submissions "
        f"in {summary.seconds:.0f}s"
    )
    for k, v in summary.rows.items():
        print(f"  {k:<14} {v:>9,}")
    if out_dir:
        print(f"Files written to {out_dir}")
    return 0


def cmd_ingest_dir(args: argparse.Namespace) -> int:
    from app.synth.runner import ingest_directory

    with SessionLocal() as db:
        n = ingest_directory(db, Path(args.path), progress=print)
    print(f"Ingested {n} submissions")
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    path = Path(args.file)
    content = path.read_bytes()
    df, fmt = parse_bytes(content, path.name)
    spec = DATASETS[args.dataset]
    mapping = json.loads(args.mapping) if args.mapping else suggest_mapping(list(df.columns), spec)
    frame = apply_mapping(df, mapping, spec)
    with SessionLocal() as db:
        try:
            if args.dataset == "entity_profile":
                result = upsert_entity_profiles(db, frame)
                db.commit()
                print(f"Upserted entities: {', '.join(result.entity_codes)}")
                return 0
            if not (args.entity and args.period_start and args.period_end):
                print("--entity, --period-start and --period-end are required", file=sys.stderr)
                return 1
            sub = ingest_bundle(
                db,
                entity_code=args.entity,
                period_start=date.fromisoformat(args.period_start),
                period_end=date.fromisoformat(args.period_end),
                frames={args.dataset: frame},
                source_format=fmt,
                actor="cli",
                file_sha256=hashlib.sha256(content).hexdigest(),
                assume_tz=args.tz,
            )
            db.commit()
        except IngestError as exc:
            print(f"Rejected: {exc}", file=sys.stderr)
            return 1
    print(json.dumps(sub.dq_report_json, indent=2, default=str))
    return 0 if sub.status != "rejected" else 1


def cmd_analyze(args: argparse.Namespace) -> int:
    from app.analytics.runner import RunError, create_run, execute_run

    window = None
    if args.window_start and args.window_end:
        window = (date.fromisoformat(args.window_start), date.fromisoformat(args.window_end))
    with SessionLocal() as db:
        try:
            run = create_run(db, window=window, actor="cli")
        except RunError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        run_id = run.id
    execute_run(run_id, progress=print if args.verbose else None)
    with SessionLocal() as db:
        from app.models.analysis import AnalysisRun

        done = db.get(AnalysisRun, run_id)
        assert done is not None
        print(
            f"Run {run_id} {done.status}: {done.progress_json.get('findings')} findings, "
            f"{done.progress_json.get('seconds')}s"
        )
        for err in done.progress_json.get("errors", []):
            print(f"  signal error: {err}", file=sys.stderr)
    if args.evaluate:
        return cmd_evaluate(argparse.Namespace(run=run_id))
    return 0


def cmd_evaluate(args: argparse.Namespace) -> int:
    from sqlalchemy import func

    from app.analytics.evaluation import evaluate
    from app.models.analysis import AnalysisRun

    with SessionLocal() as db:
        run_id = args.run or db.scalar(
            select(func.max(AnalysisRun.id)).where(AnalysisRun.status == "succeeded")
        )
        if run_id is None:
            print("No successful run to evaluate", file=sys.stderr)
            return 1
        ev = evaluate(db, run_id)
        if ev is not None and getattr(args, "json", None):
            from app.analytics.validation import summary

            data = summary(db, run_id)
            Path(args.json).write_text(json.dumps(data, default=str), encoding="utf-8")
    if ev is None:
        print("No synthetic ground truth in this database", file=sys.stderr)
        return 1
    print(f"\nRun {run_id} vs planted truth")
    print(
        f"{'signal':<7} {'planted':>7} {'flagged':>7} {'TP':>4} {'prec':>6} {'recall':>6}  "
        f"false positives / missed"
    )
    for s in ev.signals:
        prec = "-" if s.precision is None else f"{s.precision:.2f}"
        rec = "-" if s.recall is None else f"{s.recall:.2f}"
        notes = []
        if s.false_pos:
            notes.append("FP " + ",".join(s.false_pos))
        if s.missed:
            notes.append("MISS " + ",".join(s.missed))
        print(
            f"{s.signal_id:<7} {s.planted:>7} {s.flagged:>7} {s.true_pos:>4} {prec:>6} "
            f"{rec:>6}  {'; '.join(notes)}"
        )
    print(f"\nWeakened entities caught by a planted signal: {ev.weak_caught}/{ev.weak_entities}")
    print(
        f"Healthy entities with any finding: {len(ev.healthy_flagged)}/{ev.healthy_entities} "
        f"({ev.healthy_flag_rate:.0%}) {', '.join(ev.healthy_flagged)}"
    )
    if ev.ndcg_at_10 is not None:
        print(
            f"Ranking vs expert severity: NDCG@10 {ev.ndcg_at_10:.3f}, "
            f"precision@10 {ev.precision_at_10:.0%}"
        )
        _print_ranking(run_id)
    return 0


def _print_ranking(run_id: int, top: int = 15) -> None:
    from app.models.analysis import EntityScore, SyntheticTruth
    from app.models.entities import Entity

    with SessionLocal() as db:
        rows = db.execute(
            select(
                EntityScore.rank,
                Entity.code,
                EntityScore.sai,
                SyntheticTruth.archetype,
                EntityScore.drivers_json,
            )
            .join(Entity, Entity.id == EntityScore.entity_id)
            .outerjoin(SyntheticTruth, SyntheticTruth.entity_id == Entity.id)
            .where(EntityScore.run_id == run_id)
            .order_by(EntityScore.rank)
            .limit(top)
        ).all()
    print(f"\n{'#':>3} {'entity':<12} {'SAI':>5}  {'planted archetype':<18} top drivers")
    for rnk, code, sai, arch, drivers in rows:
        sigs = ",".join(d["signal_id"] for d in drivers.get("drivers", [])[:4])
        print(f"{rnk:>3} {code:<12} {sai:>5.1f}  {arch or '-':<18} {sigs}")


def cmd_robustness(args: argparse.Namespace) -> int:
    from app.analytics.robustness import StudyConfig, run_study

    configs = [StudyConfig.parse(c) for c in args.configs.split(",") if c.strip()]
    batch = run_study(configs, scratch_db=args.scratch_db, workers=args.workers, progress=print)
    print(f"Robustness batch {batch}: {len(configs)} configuration(s) stored")
    return 0


def cmd_contract_docs(args: argparse.Namespace) -> int:
    lines = [
        "# SAT-SA Data Contract",
        "",
        "_Generated by `python -m app.cli contract-docs` from `app/ingestion/contract.py`, "
        "the same definition the validator enforces. Do not edit by hand._",
        "",
        "Each CSE sends periodic submissions (typically monthly) containing any of the datasets "
        "below as CSV, JSON or NDJSON, or pushes them to `POST /api/ingest/json`. Column names "
        "may differ: the ingestion screen maps them onto these fields. Fields marked "
        "**pseudonymised** are HMAC-hashed on arrival, so raw hostnames and analyst names are "
        "never stored. Timestamps without an offset are read in the submission's timezone "
        "(default Asia/Kolkata).",
        "",
        "**Not required, by design:** raw logs, packet captures, payloads, customer or "
        "personal data.",
        "",
    ]
    for d in DATASETS.values():
        lines += [f"## {d.label} (`{d.key}`)", "", d.description, ""]
        if d.natural_key:
            lines += [
                f"Unique key: `{' + '.join(d.natural_key)}` (re-sending a row updates it).",
                "",
            ]
        lines += ["| Field | Type | Required | Notes |", "|---|---|---|---|"]
        for f in d.fields:
            notes = [f.description] if f.description else []
            if f.enum:
                notes.append(
                    "one of: "
                    + ", ".join(f"`{v}`" for v in f.enum)
                    + (" (others accepted with a warning)" if f.open_enum else "")
                )
            if f.pseudonymize:
                notes.append("**pseudonymised**")
            lines.append(
                f"| `{f.name}` | {f.kind} | {'yes' if f.required else ''} | {'; '.join(notes)} |"
            )
        lines.append("")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")
    return 0


def cmd_signal_docs(args: argparse.Namespace) -> int:
    from app.analytics.config import load_config
    from app.analytics.docs import signal_library_markdown

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(signal_library_markdown(load_config()), encoding="utf-8")
    print(f"Wrote {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="satsa")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-user", help="Create an application user")
    p.add_argument("--username", required=True)
    p.add_argument("--display-name")
    p.add_argument("--role", choices=[r.value for r in UserRole], default=UserRole.SUPERVISOR.value)
    p.add_argument("--password", help="Omit to be prompted")
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser("verify-audit", help="Verify the audit hash chain")
    p.set_defaults(func=cmd_verify_audit)

    p = sub.add_parser("synth", help="Generate synthetic CSE submissions with planted weaknesses")
    p.add_argument("--entities", type=int, default=40)
    p.add_argument("--months", type=int, default=12)
    p.add_argument("--seed", type=int, default=2026)
    p.add_argument("--start", help="First month (YYYY-MM-DD); default ends last month")
    p.add_argument("--out", help="Also write submission CSVs + truth.json to this directory")
    p.add_argument("--no-load", action="store_true", help="Do not load into the database")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Delete ALL existing entity data and analysis results first",
    )
    p.add_argument(
        "--workers", type=int, default=4, help="Parallel worker processes (use 1 to debug)"
    )
    p.add_argument(
        "--intensity-scale",
        type=float,
        default=1.0,
        help="Weaken (<1) planted behaviour, for sensitivity studies",
    )
    p.set_defaults(func=cmd_synth)

    p = sub.add_parser("ingest-dir", help="Load a directory of submissions (synth --out layout)")
    p.add_argument("path")
    p.set_defaults(func=cmd_ingest_dir)

    p = sub.add_parser("ingest", help="Ingest one file for one dataset")
    p.add_argument("--dataset", required=True, choices=["entity_profile", *LOAD_ORDER])
    p.add_argument("--file", required=True)
    p.add_argument("--entity")
    p.add_argument("--period-start")
    p.add_argument("--period-end")
    p.add_argument("--mapping", help='JSON {"canonical_field": "source column"}; default: auto')
    p.add_argument("--tz", default="Asia/Kolkata", help="Timezone for timestamps without offset")
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("analyze", help="Run the signal engine over all entities")
    p.add_argument("--window-start", help="YYYY-MM-DD (inclusive); default: all data")
    p.add_argument("--window-end", help="YYYY-MM-DD (exclusive)")
    p.add_argument("--evaluate", action="store_true", help="Score against synthetic truth")
    p.add_argument("-v", "--verbose", action="store_true")
    p.set_defaults(func=cmd_analyze)

    p = sub.add_parser("evaluate", help="Score a run's findings against synthetic truth")
    p.add_argument("--run", type=int, help="Run id (default: latest successful)")
    p.add_argument("--json", help="Also write the full validation summary to this file")
    p.set_defaults(func=cmd_evaluate)

    p = sub.add_parser("robustness", help="Re-validate on fresh datasets (scratch database)")
    p.add_argument(
        "--configs",
        default="7:1.0,99:1.0,2026:0.75,2026:0.5",
        help="Comma-separated seed:intensity_scale pairs",
    )
    p.add_argument("--scratch-db", default="satsa_robust")
    p.add_argument("--workers", type=int, default=4)
    p.set_defaults(func=cmd_robustness)

    p = sub.add_parser("contract-docs", help="Write the data contract as Markdown")
    p.add_argument("--out", default="../docs/DATA_CONTRACT.md")
    p.set_defaults(func=cmd_contract_docs)

    p = sub.add_parser("signal-docs", help="Write the signal library as Markdown")
    p.add_argument("--out", default="../docs/SIGNAL_LIBRARY.md")
    p.set_defaults(func=cmd_signal_docs)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())

# SAT-SA: Supervisory Analytics Tool for SOC Assessment

SIH 2026 · NCIIPC problem statement. SAT-SA helps supervisors analyse SOC alert and
case-management submissions from many Critical Sector Entities. It detects **execution gaps**
and **negative space**, then prioritises entities and samples for manual review. Every finding
comes with explainable, auditable evidence.

## Documentation

| Document | What it covers |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Topology, data flow, analytics engine, **AI/ML disclosure**, security (2 pages) |
| [Functional design](docs/FUNCTIONAL_DESIGN.md) | Roles, supervisory workflow, screens, requirement traceability |
| [Analytics methodology](docs/ANALYTICS_METHODOLOGY.md) | Peer statistics, execution gaps, negative space, trends, unknown patterns, scoring |
| [Signal library](docs/SIGNAL_LIBRARY.md) | All 22 signals with thresholds (generated from `signals.yaml`) |
| [Data contract](docs/DATA_CONTRACT.md) | Data requirements: every dataset and field CSEs submit (generated) |
| [Infrastructure](docs/INFRASTRUCTURE.md) | Hardware, measured performance and scaling, operations runbook |
| [Validation](docs/VALIDATION.md) | Validation methodology and results |
| [Pitch deck](docs/pitch/SAT-SA_pitch_deck.pdf) ([HTML source](docs/pitch/deck.html)) | 5-slide technical presentation |
| [Demo script](docs/pitch/DEMO_SCRIPT.md) · [Judge Q&A](docs/pitch/JUDGE_QA.md) | 2-minute video shot list; 30 rehearsed questions |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Original problem analysis and build plan |

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11.9 · FastAPI · SQLAlchemy 2 · Alembic · psycopg 3 · pandas / scikit-learn (CPU only) |
| Frontend | React 19 · TypeScript · Vite 6 · Tailwind 4 · ECharts · TanStack Query |
| Database | PostgreSQL 16 (Docker locally, Neon in the cloud demo) |
| Demo hosting | Render (API) · Vercel (web) · Neon (DB) |
| Target deployment | Fully offline via Docker Compose (air-gapped, no external services) |

## Quick start (local)

Prerequisites: Docker Desktop, Python 3.11.9, Node 22+.

```bash
# 1. Database (also creates the satsa_test database for the test suite)
docker compose up -d --wait db

# 2. Backend
cd backend
py -3.11 -m venv .venv              # macOS/Linux: python3.11 -m venv .venv
.venv\Scripts\activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt -c constraints.txt
copy .env.example .env              # macOS/Linux: cp .env.example .env
alembic upgrade head
python -m app.cli create-user --username admin --role admin
python -m app.cli synth --reset --out ../data/synth   # ~2 min: 40 synthetic CSEs x 12 months
python -m app.cli analyze --evaluate                  # ~1 min: run all signals, score vs truth
uvicorn app.main:app --reload       # http://localhost:8000/api/docs

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

Optional DB browser: `docker compose --profile tools up -d` → http://localhost:8080
(server `db`, user `satsa`, password `satsa_dev`).

## Everyday commands

| Where | Command | Purpose |
|---|---|---|
| backend | `pytest` | Test suite (needs the compose DB running) |
| backend | `ruff check . && ruff format .` | Lint + format |
| backend | `mypy app` | Type check |
| backend | `alembic revision --autogenerate -m "msg"` | New migration after changing models |
| backend | `python -m app.cli verify-audit` | Verify the audit log hash chain |
| backend | `python -m app.cli synth --reset [--out DIR]` | Regenerate the synthetic dataset (wipes entity data, keeps users) |
| backend | `python -m app.cli ingest --dataset alerts --file f.csv --entity CODE --period-start … --period-end …` | Ingest one file (auto column mapping) |
| backend | `python -m app.cli ingest-dir DIR` | Load a directory laid out like `synth --out` |
| backend | `python -m app.cli contract-docs` | Regenerate `docs/DATA_CONTRACT.md` |
| backend | `python -m app.cli signal-docs` | Regenerate `docs/SIGNAL_LIBRARY.md` (a test fails if either doc is stale) |
| backend | `python -m app.cli analyze [--window-start … --window-end …] [--evaluate]` | Run the signal engine (a reproducible, audit-logged run) |
| backend | `python -m app.cli evaluate [--run N] [--json FILE]` | Precision/recall of a run against the synthetic ground truth |
| backend | `python -m app.cli robustness [--configs "7:1.0,2026:0.5"]` | Re-validate on fresh datasets in a scratch DB (~5 min per config) |
| frontend | `npm run lint` / `npm run typecheck` / `npm test` | Checks |
| frontend | `npm run gen:api` | Regenerate TS types from the running API's OpenAPI schema |

**Tuning signals:** thresholds, severities and finding wording live in
[`backend/config/signals.yaml`](backend/config/signals.yaml). Its SHA-256 is recorded on every
run, so a change is always traceable. After editing, re-run `analyze --evaluate` and check that
no healthy entity starts being flagged. Then run `signal-docs` to refresh the published
library.

**Dependency policy:** `requirements*.txt` hold direct pins, and `constraints.txt` locks every
transitive package. After changing a pin, reinstall and regenerate the lock with
`pip freeze > constraints.txt`. The frontend is locked by `package-lock.json`, so use `npm ci` in CI.

## Repository layout

```
backend/
  app/
    analytics/    signal engine, scoring, sampling, validation
    api/          REST routers
    audit/        hash-chained audit log
    core/         settings, DB engine, security, pseudonymisation, rate limit, headers
    ingestion/    data contract, parsing, mapping, validation, COPY loading
    models/       canonical data model (entities, alerts, cases, findings, ...)
    schemas/      Pydantic DTOs
    synth/        synthetic CSE generator with planted weaknesses
    cli.py        create-user, verify-audit, synth, ingest, analyze, evaluate, robustness
  config/         signals.yaml (thresholds, weights, formula)
  alembic/        migrations
  tests/
  Dockerfile      API image (offline bundle)
frontend/
  src/
    api/          fetch client (+ generated OpenAPI types)
    components/   layout, charts, UI primitives
    pages/        one folder/page per view (lazy-loaded)
    store/        zustand stores
    lib/          helpers, palette, labels
  Dockerfile      web image: static build + nginx (same-origin /api proxy)
docs/             plan, data contract, validation methodology
infra/db/init/    compose DB bootstrap SQL
infra/offline/    air-gapped bundle export / load scripts
docker-compose.yml          local development database
docker-compose.offline.yml  full offline stack (db + api + web)
render.yaml       Render blueprint (API)
```

## Cloud demo deployment

Step-by-step guide with every command: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). In short:

1. **Neon**: create a project in region **AWS Asia Pacific (Singapore)** with Postgres 16, and
   copy both the **pooled** (host contains `-pooler`) and **direct** connection strings.
2. **Seed Neon by copying your local database** into it, before anything else touches it. The
   dump carries the schema and the migration version, so no separate migration step is needed;
   user accounts and supervisor decisions are left out on purpose.
3. **Render**: New → Blueprint → select this repo (uses `render.yaml`). Set `DATABASE_URL`
   (Neon pooled URL) and `CORS_ORIGINS` (your Vercel URL). The secrets are generated automatically.
4. **Vercel**: import the repo with **Root Directory** set to `frontend`. Set
   `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`.
5. Create users against Neon from your laptop, e.g.
   `DATABASE_URL="<neon url>" python -m app.cli create-user --username demo --role admin`.

**Demo account on the login page (optional).** Create an admin such as `demo` with
`create-user`, then set `VITE_DEMO_USERNAME` and `VITE_DEMO_PASSWORD` (Vercel project settings,
or `frontend/.env.development.local` locally, which git ignores). The login page then shows the
credentials and a one-click sign-in. The values are built into the public JavaScript, so use
this only for the synthetic-data demo and never in a real deployment.

Render's free tier sleeps after 15 minutes idle. The UI shows a "Starting up…"
screen until `/api/health` responds, so open the app a few minutes before a demo.

## Offline (air-gapped) deployment

NCIIPC can run SAT-SA entirely inside a controlled network. The stack is three containers:
Postgres, the API and an nginx web server. The database and API sit on a Docker network marked
`internal`, which has no route out. Only the web port is published. The app never calls a
cloud service, SaaS API or hosted model, and fonts and scripts are self-hosted.

**On a connected machine**, build the bundle (images, compose file, env template, load script
and checksums):

```bash
./infra/offline/export-bundle.sh 0.1.0                          # Linux/macOS -> tar.gz
powershell -File infra\offline\export-bundle.ps1 -Version 0.1.0  # Windows   -> tar
```

The output is `dist/satsa-offline-0.1.0/`, about 330 MB. Carry it across on approved media.

**On the air-gapped host** (Docker Engine with Compose v2):

```bash
cd satsa-offline-0.1.0
./load-bundle.sh            # verifies SHA256SUMS, loads images, creates .env.offline
# edit .env.offline: set the secrets (openssl rand -hex 32), then:
./load-bundle.sh            # starts the stack with --pull never
docker compose -f docker-compose.offline.yml --env-file .env.offline --profile demo run --rm seed  # optional demo data
```

Open `http://<host>:8080`. For real CSE data, create users with
`docker compose -f docker-compose.offline.yml --env-file .env.offline exec api python -m app.cli create-user --username <name> --role supervisor`
and upload submissions on the Data Ingestion page. Back up with
`docker compose ... exec db pg_dump -U satsa -Fc satsa > satsa.dump`.

What was checked on this build:
- The API and database containers cannot reach the internet ("Network is unreachable", no
  DNS). The API port is not exposed on the host.
- Headless Edge visited all 12 pages through nginx: 248 requests, none to another origin, and
  no CSP violations.
- A clean install built entirely from the bundle (images deleted first, loaded with no registry
  access) seeded the demo data and produced the same 48 findings and Validation Lab results as
  development.

## Security controls

| Control | Where |
|---|---|
| Refuses to start in production with default, short (<32 chars) or shared secrets | `app/core/config.py` |
| Login throttling: 5 failures per client + username in 15 min → 429 + `Retry-After`, audit-logged | `app/core/ratelimit.py`, `app/api/auth.py` |
| Security headers on every API response (CSP `default-src 'none'`, nosniff, DENY framing, no-referrer, `Cache-Control: no-store`) | `app/core/headers.py` |
| Strict page CSP (`'self'` only, no inline scripts); nginx overwrites `X-Forwarded-For` so clients cannot spoof the throttle key | `frontend/nginx-security-headers.conf`, `frontend/nginx.conf` |
| API docs/OpenAPI disabled in production; CORS limited to configured origins, methods and headers | `app/main.py` |
| CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`, tab, CR) | `app/api/review.py` |
| Role-based access, JWT sessions, bcrypt passwords, HMAC pseudonymisation of analyst identities | `app/core/security.py`, `app/core/pseudonymize.py` |
| Tamper-evident, hash-chained audit log (`cli verify-audit`) | `app/audit/chain.py` |
| Non-root API container, pinned image and dependency versions (`constraints.txt`) | `backend/Dockerfile` |

The login throttle is held in memory per API process, which is correct for the single-worker
deployments here. Running several workers or replicas would need a shared store.

## Build status

- [x] **Phase 0: Foundations.** Monorepo, compose DB, full data model + migration, auth (JWT,
  roles), hash-chained audit log, pseudonymisation, health check, app shell + theme, CI,
  deploy configs
- [x] **Phase 1: Data.** Data contract ([`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md)),
  CSV/JSON/NDJSON parsing, automatic column mapping, validation with per-submission
  data-quality reports, HMAC pseudonymisation, bulk COPY loading with order-independent linking,
  JSON push API, synthetic generator with 10 planted SOC archetypes (+ ground truth), Data
  Ingestion page
- [x] **Phase 2: Analytics core.** 12 execution-gap + 8 negative-space signals (incl. the
  Poisson expected-evidence model with Benjamini–Hochberg correction), robust peer baselines,
  monthly entity features, reproducible run manifests, run/finding/evidence APIs, Signal Library
  and Audit & Runs pages. On the 40-entity dataset, every planted signal is found (18/20 weakened
  entities; the 2 misses are hold-outs reserved for Phase 3's anomaly model) with 0/20 healthy
  entities flagged. An out-of-sample dataset (seed 7, thresholds frozen) gave the same result.
  A full run takes ~55 s at ~210 MB peak memory.
- [x] **Phase 3: Scoring & explanations.** 8 capability scores and the Supervisory
  Attention Index (formula published in `signals.yaml` and served by `/api/scores`); TR-01
  deterioration detection (own-baseline ratios + CUSUM onset); AN-01 Isolation Forest that
  only reports behaviour **not explained** by existing findings, cohort-standardised
  (24x7 vs business hours); review sample packs (finding-directed + random control, CSV
  export, examiner outcomes); entity profiles. All 20/20 weakened entities caught, 0/20 healthy
  flagged, NDCG@10 0.93 and precision@10 100% against the planted expert severity, reproduced
  on an out-of-sample dataset.
- [x] **Phase 4: Supervisory UI.** Command Centre (KPIs, entity constellation, attention
  ranking), Entities and Entity Profile (capability bullet bars vs peers, declared posture,
  findings, monthly trend small multiples), Evidence Trail (narrative → peer strip → rule →
  records → supervisor judgement, audit-logged), Negative Space (coverage across entities +
  expected-vs-observed heatmap with holes), Peer Benchmarks (cohort-aware), Trends (focus vs
  peer median), Review Queue (outcomes, directed vs control hit rates, CSV export) and a
  printable A4 Briefing with provenance. Charts follow a validated palette (colour-blind and
  contrast checked), never rely on colour alone, and each has a table view.
- [x] **Phase 5: Validation Lab.** Per-signal precision/recall, detection-yield curve vs
  random order (2,000 simulations) and a perfect oracle, hold-out spotlight, per-archetype
  results, robustness study on unseen datasets (`cli robustness`), and field validation from
  supervisor verdicts and directed-vs-control review hit rates. Methodology and results:
  [`docs/VALIDATION.md`](docs/VALIDATION.md).
- [x] **Phase 6: Hardening + offline bundle.** Air-gapped Docker bundle (internal-only
  network, export/load scripts with checksums, demo seed profile), verified with no egress.
  Production secret checks, login throttling, security headers and strict CSP, CSV formula
  neutralisation, docs disabled in production. Route-level code splitting (initial JS down from
  ~1.2 MB to ~450 kB; ECharts loads only on chart pages). CI now builds both images.
- [x] **Phase 7: Pitch deliverables.** Architecture (with AI/ML disclosure), functional
  design, analytics methodology, generated signal library, infrastructure and operations
  estimates (measured at 40 and 120 CSEs), a 5-slide deck (PDF), a 2-minute demo script and
  30 rehearsed judge questions. Remaining for the team: record the video and do the dry runs.

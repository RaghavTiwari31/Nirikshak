# SAT-SA API image (offline / air-gapped deployment and any container host).
FROM python:3.11.9-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # One BLAS/OpenMP thread per process: predictable memory on small hosts.
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1

WORKDIR /app

# Dependencies first (cached layer), installed against the full transitive lock.
COPY requirements.txt constraints.txt ./
RUN pip install -r requirements.txt -c constraints.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY config ./config
COPY app ./app

# Never run as root inside the container.
RUN useradd --system --uid 10001 --home-dir /app satsa && chown -R satsa /app
USER satsa

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

# Migrations are idempotent, so running them on every start keeps the schema current.
# --proxy-headers: the client address comes from the trusted reverse proxy (nginx/Render),
# which matters for per-client login throttling.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips='*'"]

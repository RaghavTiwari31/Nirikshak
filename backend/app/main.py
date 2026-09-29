import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app import __version__
from app.api import (
    analysis,
    auth,
    entities,
    ingest,
    insights,
    review,
    scores,
    system,
    validation,
)
from app.core.config import get_settings
from app.core.headers import SecurityHeadersMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Nirikshak API",
        description="Supervisory Analytics Tool for SOC Assessment",
        version=__version__,
        default_response_class=ORJSONResponse,
        # No public schema or interactive docs in production.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    # Validation summaries and feature tables are large JSON; compress them on the wire.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.include_router(system.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(entities.router, prefix="/api")
    app.include_router(ingest.router, prefix="/api")
    app.include_router(analysis.router, prefix="/api")
    app.include_router(scores.router, prefix="/api")
    app.include_router(review.router, prefix="/api")
    app.include_router(insights.router, prefix="/api")
    app.include_router(validation.router, prefix="/api")
    return app


app = create_app()

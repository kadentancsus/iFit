"""iFit API entry point.

Run from the repository root:

    python -m uvicorn app.main:app --app-dir backend --reload --port 8000

Interactive docs: http://localhost:8000/docs
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.auth import TokenVerifier
from app.core.config import Settings, get_settings
from app.core.responses import ApiResponse, install_error_handlers, ok
from app.features.identity.router import router as identity_router
from app.features.planning.router import router as planning_router
from app.features.workout.router import router as workout_router

API_PREFIX = "/api/v1"


class Health(BaseModel):
    status: str


def create_app(
    settings: Settings | None = None,
    *,
    auth_http_client: httpx.AsyncClient | None = None,
) -> FastAPI:
    """Builds the API. Tests pass their own settings and a fake Supabase transport."""
    settings = settings or get_settings()
    http_client = auth_http_client or httpx.AsyncClient(
        timeout=settings.supabase_timeout_seconds
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await http_client.aclose()

    app = FastAPI(
        title="iFit API",
        version="0.1.0",
        description="Making Every Workout Count. All responses use { data, error }.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.token_verifier = TokenVerifier(settings, http_client)

    # Bearer tokens, not cookies, so credentials mode stays off.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.frontend_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    install_error_handlers(app)

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", response_model=ApiResponse[Health], tags=["system"])
    async def health() -> ApiResponse[Health]:
        """Liveness check. Does not require sign-in or contact Supabase."""
        return ok(Health(status="ok"))

    api.include_router(identity_router)
    api.include_router(planning_router)
    api.include_router(workout_router)
    app.include_router(api)
    return app


app = create_app()

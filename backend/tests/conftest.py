"""Shared test fixtures.

Tests never contact a real Supabase project: a fake Supabase Auth server
(httpx.MockTransport) stands in for ``GET /auth/v1/user``.
"""

from __future__ import annotations

import asyncio
import os
import random
from collections.abc import AsyncIterator, Callable, Iterator

import httpx
import pytest

# app.main builds the app at import time, so give it valid settings before any
# test module imports it. Real values come from backend/.env when developing.
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key_for_unit_tests")

from fastapi import FastAPI

from app.core.config import Settings
from app.main import create_app

SUPABASE_URL = "https://test-project.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_test_key_for_unit_tests"


def make_token(name: str) -> str:
    """A JWT-shaped token. Only the fake Auth server decides whether it is valid."""
    return f"header.{name}.signature"


#: Tokens the fake Auth server accepts, and who they belong to.
USERS = {
    make_token("alex"): {"id": "aaaaaaaa-0000-4000-8000-000000000001", "email": "alex@ifit.test"},
    make_token("bailey"): {
        "id": "bbbbbbbb-0000-4000-8000-000000000001",
        "email": "bailey@ifit.test",
    },
}
EXPIRED_TOKEN = make_token("expired")
AUTH_DOWN_TOKEN = make_token("auth-down")


class FakeSupabaseAuth:
    """Answers GET /auth/v1/user like Supabase does, with a random delay so
    concurrent requests finish out of order."""

    def __init__(self, *, jitter: bool = False) -> None:
        self.jitter = jitter
        self.calls: list[httpx.Request] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if self.jitter:
            await asyncio.sleep(random.uniform(0, 0.02))  # noqa: S311
        if request.url != httpx.URL(f"{SUPABASE_URL}/auth/v1/user"):
            return httpx.Response(404)
        if request.headers.get("apikey") != PUBLISHABLE_KEY:
            return httpx.Response(401, json={"message": "Invalid API key"})
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if token == AUTH_DOWN_TOKEN:
            raise httpx.ConnectError("auth server unreachable", request=request)
        user = USERS.get(token)
        if user is None:
            return httpx.Response(401, json={"msg": "invalid JWT: token is expired"})
        return httpx.Response(200, json={**user, "aud": "authenticated"})


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        supabase_url=SUPABASE_URL,  # type: ignore[arg-type]
        supabase_publishable_key=PUBLISHABLE_KEY,
    )


@pytest.fixture
def fake_auth() -> FakeSupabaseAuth:
    return FakeSupabaseAuth(jitter=True)


@pytest.fixture
def build_app(settings: Settings, fake_auth: FakeSupabaseAuth) -> Iterator[Callable[[], FastAPI]]:
    def build() -> FastAPI:
        return create_app(
            settings, auth_http_client=httpx.AsyncClient(transport=httpx.MockTransport(fake_auth))
        )

    yield build


@pytest.fixture
async def client(build_app: Callable[[], FastAPI]) -> AsyncIterator[httpx.AsyncClient]:
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

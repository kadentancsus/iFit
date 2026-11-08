"""Fixtures for planning endpoint tests that don't need a database.

A fake PostgREST stands in for Supabase and records every request, so tests can
show that rejected input never reaches the database.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI
from postgrest import AsyncPostgrestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.supabase import get_user_database

ROUTINE_ID = "11111111-0000-4000-8000-000000000001"
BENCH_ID = "e1f17000-0000-4000-8000-000000000001"
PUSH_UP_ID = "e1f17000-0000-4000-8000-000000000002"

CATALOG = [
    {"id": BENCH_ID, "name": "Barbell Bench Press", "load_convention": "total"},
    {"id": PUSH_UP_ID, "name": "Push-Up", "load_convention": "bodyweight"},
]
SAVED_ROW = {
    "id": ROUTINE_ID,
    "owner_id": "aaaaaaaa-0000-4000-8000-000000000001",
    "title": "Push day",
    "created_at": "2026-11-07T10:00:00+00:00",
    "updated_at": "2026-11-07T10:00:00+00:00",
    "routine_exercises": [],
}


class FakePostgrest:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.saved_id: str | None = ROUTINE_ID
        self.routines: list[dict[str, object]] = [SAVED_ROW]
        self.failure: httpx.Response | None = None

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.failure is not None:
            return self.failure
        if request.url.path.endswith("/exercises"):
            return httpx.Response(200, json=CATALOG)
        if request.url.path.endswith("/rpc/save_routine"):
            return httpx.Response(200, content=json.dumps(self.saved_id))
        return httpx.Response(200, json=self.routines)

    @property
    def rpc_calls(self) -> list[dict[str, object]]:
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith("/rpc/save_routine")
        ]


@pytest.fixture
def postgrest() -> FakePostgrest:
    return FakePostgrest()


@pytest.fixture
async def api(
    build_app: Callable[[], FastAPI], postgrest: FakePostgrest
) -> AsyncIterator[httpx.AsyncClient]:
    app = build_app()

    # Keeps the real sign-in check, which get_user_database normally brings with it.
    async def fake_database(
        _: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AsyncIterator[AsyncPostgrestClient]:
        http_client = httpx.AsyncClient(
            base_url="http://postgrest.test", transport=httpx.MockTransport(postgrest)
        )
        client = AsyncPostgrestClient(
            "http://postgrest.test", http_client=http_client, retry_enabled=False
        )
        yield client
        await client.aclose()

    app.dependency_overrides[get_user_database] = fake_database

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client



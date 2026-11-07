"""Runs the real API against real Postgres and PostgREST, with no database mocks.

Started by ``scripts/verify-api.sh``, which provides the environment variables
below. Only Supabase Auth is faked. Tokens are still real signed JWTs, so
PostgREST verifies them and Row-Level Security sees the real user.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from collections.abc import AsyncIterator
from typing import Annotated

import httpx
import pytest
from fastapi import Depends
from postgrest import AsyncPostgrestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import Settings
from app.core.supabase import get_user_database
from app.main import create_app

POSTGREST_URL = os.environ.get("IFIT_TEST_POSTGREST_URL")
JWT_SECRET = os.environ.get("IFIT_TEST_JWT_SECRET", "")

#: Created by scripts/verify-api.sh.
ALEX_ID = "aaaaaaaa-0000-4000-8000-00000000f001"
BAILEY_ID = "bbbbbbbb-0000-4000-8000-00000000f001"


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    if POSTGREST_URL:
        return
    skip = pytest.mark.skip(reason="run scripts/verify-api.sh to test against a real database")
    for item in items:
        if "integration" in item.nodeid:
            item.add_marker(skip)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def sign_token(user_id: str) -> str:
    header = _encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    claims = {
        "sub": user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    body = _encode(json.dumps(claims).encode())
    signature = hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256)
    return f"{header}.{body}.{_encode(signature.digest())}"


def headers_for(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {sign_token(user_id)}"}


def _fake_auth_server(request: httpx.Request) -> httpx.Response:
    token = request.headers["authorization"].removeprefix("Bearer ")
    payload = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return httpx.Response(200, json={"id": claims["sub"], "email": None})


@pytest.fixture
async def api() -> AsyncIterator[httpx.AsyncClient]:
    assert POSTGREST_URL is not None
    settings = Settings(
        supabase_url="https://test-project.supabase.co",  # type: ignore[arg-type]
        supabase_publishable_key="sb_publishable_test_key_for_unit_tests",
    )
    app = create_app(
        settings, auth_http_client=httpx.AsyncClient(transport=httpx.MockTransport(_fake_auth_server))
    )

    # Plain PostgREST serves from / rather than Supabase's /rest/v1, so build the
    # same per-request client as create_user_client, pointed at that root.
    async def database(
        user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AsyncIterator[AsyncPostgrestClient]:
        headers = {"Authorization": f"Bearer {user.access_token}"}
        http_client = httpx.AsyncClient(base_url=POSTGREST_URL, headers=headers, timeout=10)
        client = AsyncPostgrestClient(
            POSTGREST_URL, headers=headers, http_client=http_client, retry_enabled=False
        )
        try:
            yield client
        finally:
            await client.aclose()

    app.dependency_overrides[get_user_database] = database
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
        for user_id in (ALEX_ID, BAILEY_ID):
            routines = await client.get("/api/v1/routines", headers=headers_for(user_id))
            for routine in routines.json()["data"]:
                await client.delete(
                    f"/api/v1/routines/{routine['id']}", headers=headers_for(user_id)
                )


@pytest.fixture
def alex() -> dict[str, str]:
    return headers_for(ALEX_ID)


@pytest.fixture
def bailey() -> dict[str, str]:
    return headers_for(BAILEY_ID)



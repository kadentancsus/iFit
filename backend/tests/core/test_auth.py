"""Authentication and request-scoped identity.

Includes the required concurrent-request identity separation check: many
interleaved requests from two users must each see only their own identity,
both in the verified user and in the database client built for the request.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

import httpx
import pytest
from fastapi import FastAPI
from postgrest import AsyncPostgrestClient

from app.core.config import Settings
from app.core.supabase import UserDatabase
from app.main import create_app

from ..conftest import (
    AUTH_DOWN_TOKEN,
    EXPIRED_TOKEN,
    PUBLISHABLE_KEY,
    SUPABASE_URL,
    USERS,
    FakeSupabaseAuth,
    bearer,
    make_token,
)

pytestmark = pytest.mark.anyio

ALEX = make_token("alex")
BAILEY = make_token("bailey")


async def test_returns_the_signed_in_user(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/session", headers=bearer(ALEX))
    assert response.status_code == 200
    assert response.json() == {
        "data": {"userId": USERS[ALEX]["id"], "email": "alex@ifit.test"},
        "error": None,
    }


async def test_verifies_the_token_with_supabase_auth(
    client: httpx.AsyncClient, fake_auth: FakeSupabaseAuth
) -> None:
    await client.get("/api/v1/session", headers=bearer(ALEX))
    [call] = fake_auth.calls
    assert call.url == httpx.URL(f"{SUPABASE_URL}/auth/v1/user")
    assert call.headers["authorization"] == f"Bearer {ALEX}"
    assert call.headers["apikey"] == PUBLISHABLE_KEY


async def test_requires_a_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/session")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize(
    "header",
    [
        f"Basic {ALEX}",
        "Bearer",
        "Bearer not-a-jwt",
        f"Bearer {'x' * 9000}.a.b",
    ],
)
async def test_rejects_malformed_authorization_without_calling_supabase(
    client: httpx.AsyncClient, fake_auth: FakeSupabaseAuth, header: str
) -> None:
    response = await client.get("/api/v1/session", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_session"
    assert fake_auth.calls == []


async def test_rejects_an_expired_or_forged_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/session", headers=bearer(EXPIRED_TOKEN))
    assert response.status_code == 401
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == "invalid_session"
    assert "sign in again" in body["error"]["message"]


async def test_reports_when_supabase_auth_is_unreachable(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/session", headers=bearer(AUTH_DOWN_TOKEN))
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_unavailable"


async def test_does_not_trust_a_success_without_a_user_id(settings: Settings) -> None:
    def no_id(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"email": "who@ifit.test"})

    app = create_app(
        settings,
        auth_http_client=httpx.AsyncClient(transport=httpx.MockTransport(no_id)),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as test_client:
        response = await test_client.get("/api/v1/session", headers=bearer(ALEX))
    assert response.status_code == 401


async def test_concurrent_requests_never_mix_identities(
    build_app: Callable[[], FastAPI],
) -> None:
    app = build_app()
    clients: list[AsyncPostgrestClient] = []

    # A probe route that reports which identity its request-scoped DB client carries.
    @app.get("/test/db-identity")
    async def db_identity(db: UserDatabase) -> dict[str, str]:
        clients.append(db)
        await asyncio.sleep(0)  # yield so other requests interleave
        return {"authorization": db.session.headers["authorization"]}

    tokens = [ALEX, BAILEY] * 25
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as test_client:
        sessions, probes = await asyncio.gather(
            asyncio.gather(
                *(test_client.get("/api/v1/session", headers=bearer(t)) for t in tokens)
            ),
            asyncio.gather(
                *(test_client.get("/test/db-identity", headers=bearer(t)) for t in tokens)
            ),
        )

    for token, response in zip(tokens, sessions, strict=True):
        assert response.status_code == 200
        assert response.json()["data"]["userId"] == USERS[token]["id"]
    for token, response in zip(tokens, probes, strict=True):
        assert response.status_code == 200
        assert response.json() == {"authorization": f"Bearer {token}"}

    # One client per request, each closed when its request finished.
    assert len({id(db) for db in clients}) == len(tokens)
    assert all(db.session.is_closed for db in clients)


async def test_database_client_targets_supabase_as_the_caller(
    build_app: Callable[[], FastAPI],
) -> None:
    app = build_app()

    @app.get("/test/db-config")
    async def db_config(db: UserDatabase) -> dict[str, str]:
        return {
            "base_url": str(db.session.base_url),
            "apikey": db.session.headers["apikey"],
            "profile": db.session.headers["accept-profile"],
        }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as test_client:
        response = await test_client.get("/test/db-config", headers=bearer(ALEX))
        unauthenticated = await test_client.get("/test/db-config")

    assert response.json() == {
        "base_url": f"{SUPABASE_URL}/rest/v1/",
        "apikey": PUBLISHABLE_KEY,
        "profile": "public",
    }
    assert unauthenticated.status_code == 401

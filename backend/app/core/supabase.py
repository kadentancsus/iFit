"""Request-scoped Supabase database access.

Every request gets its own PostgREST client that sends the caller's access
token, so Postgres sees ``auth.uid()`` as that user and Row-Level Security
applies to every query and RPC. The client is closed when the request ends and
is never shared between users. No service-role key is used.

Usage in a feature router::

    @router.get("/profile")
    async def read_profile(db: UserDatabase) -> ApiResponse[Profile]:
        result = await db.table("profiles").select("*").maybe_single().execute()
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import Depends, Request
from postgrest import AsyncPostgrestClient

from .auth import AuthenticatedUser, get_current_user
from .config import Settings


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def create_user_client(settings: Settings, user: AuthenticatedUser) -> AsyncPostgrestClient:
    base_url = f"{settings.supabase_base_url}/rest/v1"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-Profile": "public",
        "Content-Profile": "public",
        "apikey": settings.supabase_publishable_key,
        "Authorization": f"Bearer {user.access_token}",
    }
    # postgrest uses a supplied http client as-is, so it carries the URL, the
    # caller's headers and the timeout. It is owned and closed by this client.
    http_client = httpx.AsyncClient(
        base_url=base_url,
        headers=headers,
        timeout=settings.supabase_timeout_seconds,
        follow_redirects=True,
    )
    return AsyncPostgrestClient(
        base_url,
        headers=headers,
        http_client=http_client,
        # Retries could repeat a write; idempotency is handled with operation IDs.
        retry_enabled=False,
    )


async def get_user_database(
    settings: Annotated[Settings, Depends(get_app_settings)],
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> AsyncIterator[AsyncPostgrestClient]:
    client = create_user_client(settings, user)
    try:
        yield client
    finally:
        await client.aclose()


UserDatabase = Annotated[AsyncPostgrestClient, Depends(get_user_database)]

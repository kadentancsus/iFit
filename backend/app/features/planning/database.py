"""Shared database helpers for the planning feature."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Collection
from typing import Annotated, Any

import httpx
from fastapi import Depends, Header
from postgrest import AsyncPostgrestClient
from postgrest.exceptions import APIError

from app.core.auth import TokenVerifier, get_current_user, get_token_verifier
from app.core.config import Settings
from app.core.responses import ApiError
from app.core.supabase import create_user_client, get_app_settings

logger = logging.getLogger("ifit.api")

#: PostgREST's codes for a token it won't accept, such as one that expired
#: after the API verified it.
_REJECTED_TOKEN = {"PGRST301", "PGRST302", "PGRST303"}


async def run(query: Any, *, expected: Collection[str] = ()) -> Any:
    """Runs a query and returns its rows, without exposing database details.

    Errors whose Postgres code is in ``expected`` are re-raised as
    :class:`APIError` so the caller can turn them into a specific message.
    """
    try:
        response = await query.execute()
    except APIError as error:
        if error.code in expected:
            raise
        if error.code in _REJECTED_TOKEN:
            raise ApiError(
                401,
                "invalid_session",
                "Your session has expired. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from None
        logger.warning("Planning query failed: %r", error)
        raise _unavailable() from None
    except httpx.HTTPError as error:
        logger.warning("Planning query failed: %r", error)
        raise _unavailable() from None
    return response.data


def _unavailable() -> ApiError:
    return ApiError(
        503,
        "database_unavailable",
        "We couldn't reach iFit's database. Nothing was saved; please try again.",
    )


async def get_public_database(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> AsyncIterator[AsyncPostgrestClient]:
    """A signed-out client for public, read-only data such as the catalog."""
    base_url = f"{settings.supabase_base_url}/rest/v1"
    headers = {"Accept": "application/json", "apikey": settings.supabase_publishable_key}
    client = AsyncPostgrestClient(
        base_url,
        headers=headers,
        http_client=httpx.AsyncClient(
            base_url=base_url, headers=headers, timeout=settings.supabase_timeout_seconds
        ),
        retry_enabled=False,
    )
    try:
        yield client
    finally:
        await client.aclose()


PublicDatabase = Annotated[AsyncPostgrestClient, Depends(get_public_database)]


async def get_optional_user_database(
    settings: Annotated[Settings, Depends(get_app_settings)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
    authorization: Annotated[str | None, Header()] = None,
) -> AsyncIterator[AsyncPostgrestClient | None]:
    """The caller's client when they send a token, else None.

    For public pages that add personal details when signed in. A token that is
    sent but invalid still fails with 401 rather than being ignored.
    """
    if authorization is None:
        yield None
        return
    user = await get_current_user(verifier, authorization)
    client = create_user_client(settings, user)
    try:
        yield client
    finally:
        await client.aclose()


OptionalUserDatabase = Annotated[
    AsyncPostgrestClient | None, Depends(get_optional_user_database)
]

"""Running PostgREST queries without leaking database details to callers."""

from __future__ import annotations

import logging
from collections.abc import Collection
from typing import Any

import httpx
from postgrest.exceptions import APIError

from app.core.responses import ApiError

logger = logging.getLogger("ifit.api")

#: PostgREST's codes for a token it won't accept, e.g. one that expired after
#: the API verified it.
_REJECTED_TOKEN = frozenset({"PGRST301", "PGRST302", "PGRST303"})


def database_unavailable() -> ApiError:
    return ApiError(
        503,
        "database_unavailable",
        "We couldn't reach iFit's database. Nothing was saved; please try again.",
    )


async def execute(query: Any, *, expected: Collection[str] = ()) -> Any:
    """Runs a query and returns the PostgREST response.

    Postgres error codes listed in ``expected`` are re-raised as
    :class:`postgrest.exceptions.APIError` for the caller to explain; anything
    else becomes a generic 401 or 503 and is logged server-side only.
    """
    try:
        return await query.execute()
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
        logger.warning("Database query failed: %r", error)
        raise database_unavailable() from None
    except httpx.HTTPError as error:
        logger.warning("Database query failed: %r", error)
        raise database_unavailable() from None


async def rows(query: Any, *, expected: Collection[str] = ()) -> list[dict[str, Any]]:
    """Runs a query and returns its rows as a list of dicts."""
    data = (await execute(query, expected=expected)).data
    if not isinstance(data, list):
        logger.warning("Unexpected database response: %r", type(data))
        raise database_unavailable()
    return data

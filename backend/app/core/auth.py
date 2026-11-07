"""Authentication: who is making this request?

The frontend signs in with Supabase Auth and sends the user's access token as
``Authorization: Bearer <token>``. Every token is verified with the configured
Supabase project's Auth server (which checks signature, expiry and revocation)
before the request is trusted. Tokens are never merely decoded.

Each request carries its own token and gets its own :class:`AuthenticatedUser`;
nothing about one user's session is stored where another request can see it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated

import httpx
from fastapi import Depends, Header, Request

from .config import Settings
from .responses import ApiError

#: Supabase access tokens are a few hundred bytes; anything far larger is junk.
_MAX_TOKEN_LENGTH = 8192

_SIGN_IN_AGAIN = "Your session has expired. Please sign in again."


def _unauthenticated(code: str, message: str) -> ApiError:
    return ApiError(401, code, message, headers={"WWW-Authenticate": "Bearer"})


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """The verified identity of the caller for one request."""

    id: str
    email: str | None
    #: The caller's own token, used to query Supabase as them so RLS applies.
    access_token: str = field(repr=False)


class TokenVerifier:
    """Verifies access tokens against Supabase Auth (``GET /auth/v1/user``).

    Holds only configuration and a connection pool; the token travels with each
    call, so concurrent requests for different users cannot mix identities.
    """

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._user_url = f"{settings.supabase_base_url}/auth/v1/user"
        self._api_key = settings.supabase_publishable_key
        self._http = http_client

    async def verify(self, access_token: str) -> AuthenticatedUser:
        try:
            response = await self._http.get(
                self._user_url,
                headers={"apikey": self._api_key, "Authorization": f"Bearer {access_token}"},
            )
        except httpx.HTTPError:
            raise ApiError(
                503,
                "auth_unavailable",
                "We couldn't reach the sign-in service. Check your connection and try again.",
            ) from None

        if response.status_code in (401, 403):
            raise _unauthenticated("invalid_session", _SIGN_IN_AGAIN)
        if response.status_code != 200:
            raise ApiError(
                503,
                "auth_unavailable",
                "The sign-in service had a problem. Please try again in a moment.",
            )

        try:
            body = response.json()
        except ValueError:
            body = None
        user_id = body.get("id") if isinstance(body, dict) else None
        if not isinstance(user_id, str) or not user_id:
            raise _unauthenticated("invalid_session", _SIGN_IN_AGAIN)
        email = body.get("email") if isinstance(body, dict) else None
        return AuthenticatedUser(
            id=user_id,
            email=email if isinstance(email, str) else None,
            access_token=access_token,
        )


def get_token_verifier(request: Request) -> TokenVerifier:
    verifier: TokenVerifier = request.app.state.token_verifier
    return verifier


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise _unauthenticated("not_authenticated", "Please sign in to continue.")
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if (
        scheme.lower() != "bearer"
        or not token
        or len(token) > _MAX_TOKEN_LENGTH
        or token.count(".") != 2
    ):
        raise _unauthenticated("invalid_session", _SIGN_IN_AGAIN)
    return token


async def get_current_user(
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """FastAPI dependency: the verified caller, or a 401 in the shared error shape."""
    return await verifier.verify(_bearer_token(authorization))


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]

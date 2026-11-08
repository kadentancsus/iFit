"""Reading and updating the caller's own profile.

Every query is scoped to the verified user ID *and* runs as that user, so
Row-Level Security in 0001_identity.sql enforces the same rule a second time.
The client never supplies a user ID.
"""

from __future__ import annotations

from contextlib import suppress
from typing import Any

from postgrest import AsyncPostgrestClient
from postgrest.exceptions import APIError

from app.contracts.identity import Profile, ProfileUpdate
from app.core.auth import AuthenticatedUser
from app.core.database import rows
from app.core.responses import ApiError

COLUMNS = "user_id,display_name,display_unit,timezone,created_at,updated_at"

_UNIQUE_VIOLATION = "23505"
_CHECK_VIOLATION = "23514"

FALLBACK_NAME = "Athlete"


def default_display_name(email: str | None) -> str:
    """The same fallback the sign-up trigger uses: the email's local part."""
    local = (email or "").split("@", 1)[0].strip()[:50].strip()
    return local or FALLBACK_NAME


def _to_profile(row: dict[str, Any]) -> Profile:
    return Profile.model_validate(row)


async def _select(db: AsyncPostgrestClient, user_id: str) -> list[dict[str, Any]]:
    return await rows(db.table("profiles").select(COLUMNS).eq("user_id", user_id))


async def get_profile(db: AsyncPostgrestClient, user: AuthenticatedUser) -> Profile:
    """The caller's profile, created with defaults if sign-up never made one."""
    found = await _select(db, user.id)
    if found:
        return _to_profile(found[0])

    # Accounts made before 0001_identity, or a failed trigger, heal here.
    # user_id defaults to auth.uid() in the database; it is never sent.
    # If a concurrent request created it first, the unique violation is fine.
    with suppress(APIError):
        await rows(
            db.table("profiles").insert({"display_name": default_display_name(user.email)}),
            expected={_UNIQUE_VIOLATION},
        )
    found = await _select(db, user.id)
    if not found:
        raise ApiError(404, "not_found", "We couldn't find your profile. Please sign in again.")
    return _to_profile(found[0])


async def update_profile(
    db: AsyncPostgrestClient, user: AuthenticatedUser, update: ProfileUpdate
) -> Profile:
    """Applies only the fields the caller sent."""
    changes = update.model_dump(include=update.model_fields_set)
    await get_profile(db, user)  # make sure there is a row to update
    try:
        updated = await rows(
            db.table("profiles").update(changes).eq("user_id", user.id),
            expected={_CHECK_VIOLATION},
        )
    except APIError:
        # The database is the final judge of time zone names (pg_timezone_names).
        raise ApiError(
            422,
            "invalid_input",
            "That time zone isn't supported. Pick one from the list.",
            field="timezone",
        ) from None
    if not updated:
        raise ApiError(404, "not_found", "We couldn't find your profile. Please sign in again.")
    return _to_profile(updated[0])

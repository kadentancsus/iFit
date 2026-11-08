"""Identity endpoints: who is signed in, their profile and their dashboard."""

from __future__ import annotations

from fastapi import APIRouter

from app.contracts.identity import Dashboard, Profile, ProfileUpdate, SessionInfo
from app.core.auth import CurrentUser
from app.core.responses import ApiResponse, ok
from app.core.supabase import UserDatabase

from . import dashboard, profile

router = APIRouter(tags=["identity"])


@router.get("/session", response_model=ApiResponse[SessionInfo], response_model_by_alias=True)
async def read_session(user: CurrentUser) -> ApiResponse[SessionInfo]:
    """Confirms the API accepts the caller's sign-in and says who they are."""
    return ok(SessionInfo(user_id=user.id, email=user.email))


@router.get("/profile", response_model=ApiResponse[Profile])
async def get_profile(user: CurrentUser, db: UserDatabase) -> ApiResponse[Profile]:
    """The caller's display name, preferred unit and time zone."""
    return ok(await profile.get_profile(db, user))


@router.patch("/profile", response_model=ApiResponse[Profile])
async def update_profile(
    update: ProfileUpdate, user: CurrentUser, db: UserDatabase
) -> ApiResponse[Profile]:
    """Changes only the fields sent. Weights stay stored in kg whatever the unit."""
    return ok(await profile.update_profile(db, user, update))


@router.get("/dashboard", response_model=ApiResponse[Dashboard])
async def get_dashboard(user: CurrentUser, db: UserDatabase) -> ApiResponse[Dashboard]:
    """Today's plan, a workout to resume, recent sessions and private progress."""
    return ok(await dashboard.get_dashboard(db, user))

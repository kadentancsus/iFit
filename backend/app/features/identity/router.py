"""Identity endpoints. Profile reads and updates are added in Stage 2."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.core.auth import CurrentUser
from app.core.responses import ApiResponse, ok

router = APIRouter(tags=["identity"])


class SessionInfo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    user_id: str
    email: str | None


@router.get("/session", response_model=ApiResponse[SessionInfo], response_model_by_alias=True)
async def read_session(user: CurrentUser) -> ApiResponse[SessionInfo]:
    """Confirms the API accepts the caller's sign-in and says who they are."""
    return ok(SessionInfo(user_id=user.id, email=user.email))

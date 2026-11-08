"""Sina Stage 2A endpoints; mount this router under /api/v1 at integration."""

from uuid import UUID

from fastapi import APIRouter

from app.contracts.workout import WorkoutDetail
from app.core.auth import CurrentUser
from app.core.responses import ApiResponse, ok
from app.core.supabase import UserDatabase

from .schemas import LogSetInput, SetLog, StartWorkoutInput
from .service import WorkoutService

router = APIRouter(tags=["workout"])


@router.post("/workouts", response_model=ApiResponse[WorkoutDetail])
async def start_workout(
    payload: StartWorkoutInput, user: CurrentUser, db: UserDatabase
) -> ApiResponse[WorkoutDetail]:
    return ok(await WorkoutService(db, user.id).start(payload))


@router.get("/workouts/active", response_model=ApiResponse[WorkoutDetail | None])
async def get_active_workout(
    user: CurrentUser, db: UserDatabase
) -> ApiResponse[WorkoutDetail | None]:
    return ok(await WorkoutService(db, user.id).get_active())


@router.get("/workouts/{sessionId}", response_model=ApiResponse[WorkoutDetail])
async def get_workout(
    sessionId: UUID, user: CurrentUser, db: UserDatabase
) -> ApiResponse[WorkoutDetail]:
    return ok(await WorkoutService(db, user.id).get_workout(sessionId))


@router.post("/sets", response_model=ApiResponse[SetLog])
async def log_set(payload: LogSetInput, user: CurrentUser, db: UserDatabase) -> ApiResponse[SetLog]:
    return ok(await WorkoutService(db, user.id).log_set(payload))

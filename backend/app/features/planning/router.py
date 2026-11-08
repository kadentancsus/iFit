"""Planning endpoints: routines, scheduling and the exercise catalog.

Request bodies are read as raw JSON rather than a Pydantic model so that
``validators.py`` can report each failure with its own stable code and field.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Query

from app.core.responses import ApiResponse, ok
from app.core.supabase import UserDatabase

from . import catalog, schedule, service
from .database import PublicDatabase
from .schemas import (
    DeletedRoutine,
    Equipment,
    ExerciseDetail,
    ExerciseSummary,
    MovementPattern,
    Muscle,
    RoutineDetail,
    RoutineSummary,
    ScheduledWorkout,
)

JsonBody = Annotated[Any, Body(description="camelCase JSON, validated by the planning rules.")]

routines = APIRouter(prefix="/routines", tags=["routines"])


@routines.get("", response_model=ApiResponse[list[RoutineSummary]])
async def list_routines(db: UserDatabase) -> ApiResponse[list[RoutineSummary]]:
    """The caller's routines, most recently changed first."""
    return ok(await service.list_routines(db))


@routines.get("/{routine_id}", response_model=ApiResponse[RoutineDetail])
async def get_routine(routine_id: str, db: UserDatabase) -> ApiResponse[RoutineDetail]:
    return ok(await service.get_routine(db, routine_id))


@routines.post("", status_code=201, response_model=ApiResponse[RoutineDetail])
async def create_routine(payload: JsonBody, db: UserDatabase) -> ApiResponse[RoutineDetail]:
    """Creates a routine. Resending the same ``operationId`` returns the first result."""
    return ok(await service.create_routine(db, payload))


@routines.put("/{routine_id}", response_model=ApiResponse[RoutineDetail])
async def update_routine(
    routine_id: str, payload: JsonBody, db: UserDatabase
) -> ApiResponse[RoutineDetail]:
    """Replaces the routine. List order is the new order; rows left out are removed."""
    return ok(await service.update_routine(db, routine_id, payload))


@routines.delete("/{routine_id}", response_model=ApiResponse[DeletedRoutine])
async def delete_routine(routine_id: str, db: UserDatabase) -> ApiResponse[DeletedRoutine]:
    """Deletes the routine and cancels its upcoming plans. Finished workouts stay."""
    return ok(await service.delete_routine(db, routine_id))


plans = APIRouter(prefix="/schedule", tags=["schedule"])


@plans.get("", response_model=ApiResponse[list[ScheduledWorkout]])
async def list_schedule(
    db: UserDatabase,
    start: Annotated[str | None, Query(alias="from", description="YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(alias="to", description="YYYY-MM-DD")] = None,
) -> ApiResponse[list[ScheduledWorkout]]:
    """The caller's planned, finished and canceled workouts by date."""
    return ok(await schedule.list_schedule(db, start=start, end=end))


@plans.post("", status_code=201, response_model=ApiResponse[ScheduledWorkout])
async def schedule_routine(payload: JsonBody, db: UserDatabase) -> ApiResponse[ScheduledWorkout]:
    """Plans a routine on ``localDate``. Resending the same ``operationId`` is harmless."""
    return ok(await schedule.schedule_routine(db, payload))


@plans.patch("/{schedule_id}", response_model=ApiResponse[ScheduledWorkout])
async def reschedule_workout(
    schedule_id: str, payload: JsonBody, db: UserDatabase
) -> ApiResponse[ScheduledWorkout]:
    """Moves an upcoming workout to ``localDate``."""
    return ok(await schedule.reschedule_workout(db, schedule_id, payload))


@plans.post("/{schedule_id}/cancel", response_model=ApiResponse[ScheduledWorkout])
async def cancel_scheduled_workout(
    schedule_id: str, db: UserDatabase
) -> ApiResponse[ScheduledWorkout]:
    """Cancels an upcoming workout. The record is kept rather than deleted."""
    return ok(await schedule.cancel_scheduled_workout(db, schedule_id))


exercises = APIRouter(prefix="/exercises", tags=["catalog"])


@exercises.get("", response_model=ApiResponse[list[ExerciseSummary]])
async def list_exercises(
    db: PublicDatabase,
    search: Annotated[str | None, Query(max_length=80)] = None,
    pattern: MovementPattern | None = None,
    equipment: Equipment | None = None,
    muscle: Muscle | None = None,
) -> ApiResponse[list[ExerciseSummary]]:
    """The public catalog. No sign-in needed."""
    return ok(
        await catalog.list_exercises(
            db, search=search, pattern=pattern, equipment=equipment, muscle=muscle
        )
    )


@exercises.get("/{id_or_slug}", response_model=ApiResponse[ExerciseDetail])
async def get_exercise(id_or_slug: str, db: PublicDatabase) -> ApiResponse[ExerciseDetail]:
    """One exercise with instructions, form cues and common mistakes."""
    return ok(await catalog.get_exercise(db, id_or_slug))


router = APIRouter()
router.include_router(routines)
router.include_router(plans)
router.include_router(exercises)

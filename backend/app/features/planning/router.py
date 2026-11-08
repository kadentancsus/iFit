"""Planning endpoints: routines, scheduling and the exercise catalog.

Request bodies are read as raw JSON rather than a Pydantic model so that
``validators.py`` can report each failure with its own stable code and field.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Query

from app.contracts.catalog import Exercise
from app.contracts.common import Equipment, MovementPattern, Muscle
from app.contracts.planning import Routine, RoutineSummary, ScheduledWorkout
from app.core.responses import ApiResponse, ok
from app.core.supabase import UserDatabase

from . import catalog, schedule, service
from .database import PublicDatabase
from .schemas import DeletedRoutine

JsonBody = Annotated[Any, Body(description="camelCase JSON, validated by the planning rules.")]
# Path names match the shared operation table in app/contracts/operations.py.
RoutineId = Annotated[str, Path(alias="routineId")]
ScheduleId = Annotated[str, Path(alias="scheduleId")]
ExerciseId = Annotated[str, Path(alias="exerciseId", description="The exercise ID or its slug.")]

routines = APIRouter(prefix="/routines", tags=["routines"])


@routines.get("", response_model=ApiResponse[list[RoutineSummary]])
async def list_routines(db: UserDatabase) -> ApiResponse[list[RoutineSummary]]:
    """The caller's routines, most recently changed first."""
    return ok(await service.list_routines(db))


@routines.get("/{routineId}", response_model=ApiResponse[Routine])
async def get_routine(routine_id: RoutineId, db: UserDatabase) -> ApiResponse[Routine]:
    return ok(await service.get_routine(db, routine_id))


@routines.post("", status_code=201, response_model=ApiResponse[Routine])
async def create_routine(payload: JsonBody, db: UserDatabase) -> ApiResponse[Routine]:
    """Creates a routine. Resending the same ``operationId`` returns the first result."""
    return ok(await service.create_routine(db, payload))


@routines.put("/{routineId}", response_model=ApiResponse[Routine])
async def update_routine(
    routine_id: RoutineId, payload: JsonBody, db: UserDatabase
) -> ApiResponse[Routine]:
    """Replaces the routine. List order is the new order; rows left out are removed."""
    return ok(await service.update_routine(db, routine_id, payload))


@routines.delete("/{routineId}", response_model=ApiResponse[DeletedRoutine])
async def delete_routine(routine_id: RoutineId, db: UserDatabase) -> ApiResponse[DeletedRoutine]:
    """Deletes the routine and cancels its upcoming plans. Finished workouts stay."""
    return ok(await service.delete_routine(db, routine_id))


plans = APIRouter(prefix="/schedule", tags=["schedule"])


@plans.get("", response_model=ApiResponse[list[ScheduledWorkout]])
async def list_schedule(
    db: UserDatabase,
    start: Annotated[str | None, Query(alias="fromDate", description="YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(alias="toDate", description="YYYY-MM-DD, inclusive")] = None,
) -> ApiResponse[list[ScheduledWorkout]]:
    """The caller's planned, finished and canceled workouts by date."""
    return ok(await schedule.list_schedule(db, start=start, end=end))


@plans.post("", status_code=201, response_model=ApiResponse[ScheduledWorkout])
async def schedule_routine(payload: JsonBody, db: UserDatabase) -> ApiResponse[ScheduledWorkout]:
    """Plans a routine on ``localDate``. Resending the same ``operationId`` is harmless."""
    return ok(await schedule.schedule_routine(db, payload))


@plans.patch("/{scheduleId}", response_model=ApiResponse[ScheduledWorkout])
async def reschedule_workout(
    schedule_id: ScheduleId, payload: JsonBody, db: UserDatabase
) -> ApiResponse[ScheduledWorkout]:
    """Moves an upcoming workout to ``localDate``."""
    return ok(await schedule.reschedule_workout(db, schedule_id, payload))


@plans.post("/{scheduleId}/cancel", response_model=ApiResponse[ScheduledWorkout])
async def cancel_scheduled_workout(
    schedule_id: ScheduleId, db: UserDatabase
) -> ApiResponse[ScheduledWorkout]:
    """Cancels an upcoming workout. The record is kept rather than deleted."""
    return ok(await schedule.cancel_scheduled_workout(db, schedule_id))


exercises = APIRouter(prefix="/exercises", tags=["catalog"])


@exercises.get("", response_model=ApiResponse[list[Exercise]])
async def list_exercises(
    db: PublicDatabase,
    search: Annotated[str | None, Query(max_length=80)] = None,
    pattern: MovementPattern | None = None,
    equipment: Equipment | None = None,
    muscle: Muscle | None = None,
) -> ApiResponse[list[Exercise]]:
    """The public catalog. No sign-in needed."""
    return ok(
        await catalog.list_exercises(
            db, search=search, pattern=pattern, equipment=equipment, muscle=muscle
        )
    )


@exercises.get("/{exerciseId}", response_model=ApiResponse[Exercise])
async def get_exercise(id_or_slug: ExerciseId, db: PublicDatabase) -> ApiResponse[Exercise]:
    """One exercise with instructions, form cues and common mistakes."""
    return ok(await catalog.get_exercise(db, id_or_slug))


router = APIRouter()
router.include_router(routines)
router.include_router(plans)
router.include_router(exercises)

"""Routine persistence.

Every function takes the caller's request-scoped client, so Postgres applies
Row-Level Security as that user. Another user's routine reads as missing rather
than forbidden, which also avoids confirming that its ID exists.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from postgrest import AsyncPostgrestClient

from app.contracts.planning import Routine, RoutineExercise, RoutineSummary
from app.core.responses import ApiError

from .database import run
from .schemas import ROUTINE_MAX_EXERCISES, DeletedRoutine, ExerciseRef, RoutineInput
from .validators import is_uuid, validate_routine_input

_ROUTINE_COLUMNS = (
    "id,owner_id,title,created_at,updated_at,"
    "routine_exercises(id,routine_id,exercise_id,position,target_sets,target_reps,target_kg,"
    "rest_seconds,exercises(name,load_convention))"
)


def routine_not_found() -> ApiError:
    return ApiError(404, "not_found", "We couldn't find that routine.")


def require_uuid(value: str, field: str = "id") -> None:
    if not is_uuid(value):
        raise ApiError(422, "invalid_id", "That request has an invalid ID.", field=field)


def _to_routine(row: Mapping[str, Any]) -> Routine:
    exercises = sorted(row["routine_exercises"], key=lambda exercise: exercise["position"])
    return Routine(
        id=row["id"],
        owner_id=row["owner_id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        exercises=tuple(
            RoutineExercise(
                id=exercise["id"],
                routine_id=exercise["routine_id"],
                exercise_id=exercise["exercise_id"],
                exercise_name=exercise["exercises"]["name"],
                load_convention=exercise["exercises"]["load_convention"],
                position=exercise["position"],
                target_sets=exercise["target_sets"],
                target_reps=exercise["target_reps"],
                target_kg=exercise["target_kg"],
                rest_seconds=exercise["rest_seconds"],
            )
            for exercise in exercises
        ),
    )


async def list_routines(db: AsyncPostgrestClient) -> list[RoutineSummary]:
    rows = await run(
        db.table("routines")
        .select("id,title,updated_at,routine_exercises(id)")
        .order("updated_at", desc=True)
    )
    return [
        RoutineSummary(
            id=row["id"],
            title=row["title"],
            exercise_count=len(row["routine_exercises"]),
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


async def get_routine(db: AsyncPostgrestClient, routine_id: str) -> Routine:
    require_uuid(routine_id, "routineId")
    rows = await run(db.table("routines").select(_ROUTINE_COLUMNS).eq("id", routine_id))
    if not rows:
        raise routine_not_found()
    return _to_routine(rows[0])


def _requested_exercise_ids(payload: object) -> list[str]:
    if not isinstance(payload, Mapping):
        return []
    rows = payload.get("exercises")
    if not isinstance(rows, list):
        return []
    # A longer list fails validation, so there is no need to look all of it up.
    candidates = [
        row.get("exerciseId") for row in rows[:ROUTINE_MAX_EXERCISES] if isinstance(row, Mapping)
    ]
    return sorted({value.lower() for value in candidates if is_uuid(value)})


async def _validated_input(db: AsyncPostgrestClient, payload: object) -> RoutineInput:
    known: dict[str, ExerciseRef] = {}
    exercise_ids = _requested_exercise_ids(payload)
    if exercise_ids:
        rows = await run(
            db.table("exercises").select("id,name,load_convention").in_("id", exercise_ids)
        )
        known = {row["id"]: ExerciseRef(**row) for row in rows}

    result = validate_routine_input(payload, lambda exercise_id: known.get(exercise_id.lower()))
    if result.error is not None:
        raise ApiError(422, result.error.code, result.error.message, field=result.error.field)
    assert result.data is not None
    return result.data


async def _save(db: AsyncPostgrestClient, routine: RoutineInput, routine_id: str | None) -> Routine:
    params: dict[str, Any] = {
        "p_routine_id": routine_id,
        "p_title": routine.title,
        "p_exercises": [
            exercise.model_dump(by_alias=True, mode="json") for exercise in routine.exercises
        ],
        "p_operation_id": routine.operation_id,
    }
    saved_id = await run(db.rpc("save_routine", params))
    if saved_id is None:
        raise routine_not_found()
    return await get_routine(db, saved_id)


async def create_routine(db: AsyncPostgrestClient, payload: object) -> Routine:
    routine = await _validated_input(db, payload)
    if routine.id is not None:
        raise ApiError(422, "invalid_id", "A new routine can't have an ID yet.", field="id")
    return await _save(db, routine, None)


async def update_routine(db: AsyncPostgrestClient, routine_id: str, payload: object) -> Routine:
    require_uuid(routine_id, "routineId")
    routine = await _validated_input(db, payload)
    if routine.id is not None and routine.id.lower() != routine_id.lower():
        raise ApiError(422, "invalid_id", "That request has an invalid ID.", field="id")
    return await _save(db, routine, routine_id)


async def delete_routine(db: AsyncPostgrestClient, routine_id: str) -> DeletedRoutine:
    """Deletes the routine; its planned workouts are canceled by a database trigger."""
    require_uuid(routine_id, "routineId")
    deleted = await run(db.table("routines").delete().eq("id", routine_id))
    if not deleted:
        raise routine_not_found()
    return DeletedRoutine(id=routine_id)

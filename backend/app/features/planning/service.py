"""Routine persistence.

Every function takes the caller's request-scoped client, so Postgres applies
Row-Level Security as that user. Another user's routine reads as missing rather
than forbidden, which also avoids confirming that its ID exists.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from postgrest import AsyncPostgrestClient

from app.core.responses import ApiError

from .database import run as _rows
from .schemas import (
    ROUTINE_MAX_EXERCISES,
    DeletedRoutine,
    ExerciseRef,
    RoutineDetail,
    RoutineExerciseView,
    RoutineInput,
    RoutineSummary,
)
from .validators import is_uuid, validate_routine_input

_ROUTINE_DETAIL_COLUMNS = (
    "id,title,updated_at,"
    "routine_exercises(id,exercise_id,position,target_sets,target_reps,target_kg,rest_seconds,"
    "exercises(name,equipment,load_convention))"
)


def _routine_not_found() -> ApiError:
    return ApiError(404, "routine_not_found", "We couldn't find that routine.")


def _require_uuid(value: str) -> None:
    if not is_uuid(value):
        raise ApiError(422, "invalid_id", "That request has an invalid ID.", field="id")


def _to_detail(row: Mapping[str, Any]) -> RoutineDetail:
    exercises = sorted(row["routine_exercises"], key=lambda exercise: exercise["position"])
    return RoutineDetail(
        id=row["id"],
        title=row["title"],
        updated_at=row["updated_at"],
        exercises=tuple(
            RoutineExerciseView(
                id=exercise["id"],
                exercise_id=exercise["exercise_id"],
                exercise_name=exercise["exercises"]["name"],
                equipment=exercise["exercises"]["equipment"],
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
    rows = await _rows(
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


async def get_routine(db: AsyncPostgrestClient, routine_id: str) -> RoutineDetail:
    _require_uuid(routine_id)
    rows = await _rows(db.table("routines").select(_ROUTINE_DETAIL_COLUMNS).eq("id", routine_id))
    if not rows:
        raise _routine_not_found()
    return _to_detail(rows[0])


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
        rows = await _rows(
            db.table("exercises").select("id,name,load_convention").in_("id", exercise_ids)
        )
        known = {row["id"]: ExerciseRef(**row) for row in rows}

    result = validate_routine_input(payload, lambda exercise_id: known.get(exercise_id.lower()))
    if result.error is not None:
        raise ApiError(422, result.error.code, result.error.message, field=result.error.field)
    assert result.data is not None
    return result.data


async def _save(
    db: AsyncPostgrestClient, routine: RoutineInput, routine_id: str | None
) -> RoutineDetail:
    params: dict[str, Any] = {
        "p_routine_id": routine_id,
        "p_title": routine.title,
        "p_exercises": [
            exercise.model_dump(by_alias=True, mode="json") for exercise in routine.exercises
        ],
        "p_operation_id": routine.operation_id,
    }
    saved_id = await _rows(db.rpc("save_routine", params))
    if saved_id is None:
        raise _routine_not_found()
    return await get_routine(db, saved_id)


async def create_routine(db: AsyncPostgrestClient, payload: object) -> RoutineDetail:
    routine = await _validated_input(db, payload)
    if routine.id is not None:
        raise ApiError(422, "invalid_id", "A new routine can't have an ID yet.", field="id")
    return await _save(db, routine, None)


async def update_routine(
    db: AsyncPostgrestClient, routine_id: str, payload: object
) -> RoutineDetail:
    _require_uuid(routine_id)
    routine = await _validated_input(db, payload)
    if routine.id is not None and routine.id.lower() != routine_id.lower():
        raise ApiError(422, "invalid_id", "That request has an invalid ID.", field="id")
    return await _save(db, routine, routine_id)


async def delete_routine(db: AsyncPostgrestClient, routine_id: str) -> DeletedRoutine:
    """Deletes the routine; its planned workouts are canceled by a database trigger."""
    _require_uuid(routine_id)
    deleted = await _rows(db.table("routines").delete().eq("id", routine_id))
    if not deleted:
        raise _routine_not_found()
    return DeletedRoutine(id=routine_id)

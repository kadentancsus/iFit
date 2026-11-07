"""Server-side validation for routines and schedules.

This is the authoritative check: the API runs it on every request before
anything reaches the database. ``frontend/src/features/planning/validators.ts``
mirrors these rules only for instant form feedback; keep the two in step.

Validators take raw decoded JSON (``Any``) rather than a Pydantic model so each
failure maps to one stable error code, message and field path that the UI can
show next to the right input.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping
from datetime import date
from typing import Any, TypeGuard

from .schemas import (
    ROUTINE_MAX_EXERCISES,
    ROUTINE_MAX_KG,
    ROUTINE_MAX_REPS,
    ROUTINE_MAX_REST_SECONDS,
    ROUTINE_MAX_SETS,
    ROUTINE_TITLE_LENGTH,
    ExerciseRef,
    PlanningError,
    PlanningErrorCode,
    PlanningResult,
    RescheduleInput,
    RoutineExerciseInput,
    RoutineInput,
    ScheduleInput,
    ScheduleStatus,
)

#: Looks up a catalog exercise by ID; returns None when it does not exist.
ExerciseLookup = Callable[[str], ExerciseRef | None]

_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
# ASCII digits only; fullmatch below so a trailing newline is not accepted.
_LOCAL_DATE_PATTERN = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")


def _fail(code: PlanningErrorCode, message: str, field: str | None = None) -> PlanningError:
    return PlanningError(code=code, message=message, field=field)


def _first_error(*errors: PlanningError | None) -> PlanningError | None:
    return next((error for error in errors if error is not None), None)


def is_uuid(value: object) -> TypeGuard[str]:
    return isinstance(value, str) and _UUID_PATTERN.fullmatch(value) is not None


def is_local_date(value: object) -> TypeGuard[str]:
    """Rejects impossible dates like 2026-02-30 as well as malformed strings."""
    if not isinstance(value, str):
        return False
    match = _LOCAL_DATE_PATTERN.fullmatch(value)
    if match is None:
        return False
    year, month, day = (int(part) for part in match.groups())
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


def _as_whole_number(value: object, minimum: int, maximum: int) -> int | None:
    """Returns the value as an int when it is a whole number in range.

    JSON has one number type, so ``3.0`` counts as a whole number, matching the
    frontend. Booleans are rejected even though Python treats them as ints.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        number = value
    elif isinstance(value, float) and math.isfinite(value) and value.is_integer():
        number = int(value)
    else:
        return None
    return number if minimum <= number <= maximum else None


def _check_optional_uuid(value: object, field: str) -> PlanningError | None:
    if value is None or is_uuid(value):
        return None
    return _fail("invalid_id", "That request has an invalid ID.", field)


def _check_future_date(local_date: object, today: str | None) -> PlanningError | None:
    if not is_local_date(local_date):
        return _fail("invalid_date", "Choose a valid date.", "localDate")
    # ISO dates sort chronologically, so plain string comparison is correct.
    if today is not None and local_date < today:
        return _fail("date_in_past", "Choose today or a later date.", "localDate")
    return None


def _validate_routine_exercise(
    value: object, index: int, find_exercise: ExerciseLookup
) -> RoutineExerciseInput | PlanningError:
    field = f"exercises.{index}"
    if not isinstance(value, Mapping):
        return _fail("invalid_input", "That exercise is invalid.", field)

    row_id = value.get("id")
    id_error = _check_optional_uuid(row_id, f"{field}.id")
    if id_error is not None:
        return id_error

    exercise_id = value.get("exerciseId")
    exercise = find_exercise(exercise_id) if is_uuid(exercise_id) else None
    if exercise is None:
        return _fail("unknown_exercise", "Choose an exercise from the list.", f"{field}.exerciseId")

    target_sets = _as_whole_number(value.get("targetSets"), 1, ROUTINE_MAX_SETS)
    if target_sets is None:
        return _fail(
            "invalid_target",
            f"Sets must be a whole number from 1 to {ROUTINE_MAX_SETS}.",
            f"{field}.targetSets",
        )
    target_reps = _as_whole_number(value.get("targetReps"), 1, ROUTINE_MAX_REPS)
    if target_reps is None:
        return _fail(
            "invalid_target",
            f"Reps must be a whole number from 1 to {ROUTINE_MAX_REPS}.",
            f"{field}.targetReps",
        )
    rest_seconds = _as_whole_number(value.get("restSeconds"), 0, ROUTINE_MAX_REST_SECONDS)
    if rest_seconds is None:
        return _fail(
            "invalid_target",
            f"Rest must be 0 to {ROUTINE_MAX_REST_SECONDS} seconds.",
            f"{field}.restSeconds",
        )

    planned_kg = value.get("targetKg")
    if planned_kg is not None:
        if exercise.load_convention == "bodyweight":
            return _fail(
                "load_not_applicable",
                f"{exercise.name} uses bodyweight, so it has no target weight.",
                f"{field}.targetKg",
            )
        if (
            isinstance(planned_kg, bool)
            or not isinstance(planned_kg, int | float)
            or not math.isfinite(planned_kg)
            or not 0 <= planned_kg <= ROUTINE_MAX_KG
        ):
            return _fail("invalid_target", "Enter a weight of 0 or more.", f"{field}.targetKg")

    return RoutineExerciseInput(
        id=row_id,
        exercise_id=exercise.id,
        target_sets=target_sets,
        target_reps=target_reps,
        target_kg=planned_kg,
        rest_seconds=rest_seconds,
    )


def validate_routine_input(
    payload: Any, find_exercise: ExerciseLookup
) -> PlanningResult[RoutineInput]:
    """Trims the title and returns the routine in its submitted order.

    Unknown fields, including any client-supplied owner or user ID, are dropped:
    ownership always comes from the authenticated user, never the request body.
    """
    if not isinstance(payload, Mapping):
        return PlanningResult(error=_fail("invalid_input", "That routine is invalid."))

    routine_id = payload.get("id")
    operation_id = payload.get("operationId")
    id_error = _first_error(
        _check_optional_uuid(routine_id, "id"),
        _check_optional_uuid(operation_id, "operationId"),
    )
    if id_error is not None:
        return PlanningResult(error=id_error)

    title = payload.get("title")
    trimmed_title = title.strip() if isinstance(title, str) else ""
    if not 0 < len(trimmed_title) <= ROUTINE_TITLE_LENGTH:
        return PlanningResult(
            error=_fail(
                "invalid_title",
                f"Give your routine a name of up to {ROUTINE_TITLE_LENGTH} characters.",
                "title",
            )
        )

    exercises = payload.get("exercises")
    if not isinstance(exercises, list):
        return PlanningResult(
            error=_fail("invalid_input", "That routine is invalid.", "exercises")
        )
    if len(exercises) > ROUTINE_MAX_EXERCISES:
        return PlanningResult(
            error=_fail(
                "too_many_exercises",
                f"A routine can have up to {ROUTINE_MAX_EXERCISES} exercises.",
                "exercises",
            )
        )

    validated: list[RoutineExerciseInput] = []
    seen_row_ids: set[str] = set()
    for index, exercise in enumerate(exercises):
        result = _validate_routine_exercise(exercise, index, find_exercise)
        if isinstance(result, PlanningError):
            return PlanningResult(error=result)
        if result.id is not None:
            row_key = result.id.lower()
            if row_key in seen_row_ids:
                return PlanningResult(
                    error=_fail(
                        "duplicate_entry",
                        "That exercise is listed twice.",
                        f"exercises.{index}.id",
                    )
                )
            seen_row_ids.add(row_key)
        validated.append(result)

    return PlanningResult(
        data=RoutineInput(
            id=routine_id,
            title=trimmed_title,
            exercises=tuple(validated),
            operation_id=operation_id,
        )
    )


def validate_schedule_input(payload: Any, today: str | None = None) -> PlanningResult[ScheduleInput]:
    """Validates a new schedule entry. When ``today`` is set, past dates are rejected."""
    if not isinstance(payload, Mapping):
        return PlanningResult(error=_fail("invalid_input", "That schedule is invalid."))

    routine_id = payload.get("routineId")
    if not is_uuid(routine_id):
        return PlanningResult(
            error=_fail("invalid_id", "Choose a routine to schedule.", "routineId")
        )

    operation_id = payload.get("operationId")
    local_date = payload.get("localDate")
    error = _first_error(
        _check_optional_uuid(operation_id, "operationId"),
        _check_future_date(local_date, today),
    )
    if error is not None:
        return PlanningResult(error=error)

    assert isinstance(local_date, str)  # guaranteed by _check_future_date
    return PlanningResult(
        data=ScheduleInput(routine_id=routine_id, local_date=local_date, operation_id=operation_id)
    )


def validate_reschedule_input(
    payload: Any, today: str | None = None
) -> PlanningResult[RescheduleInput]:
    if not isinstance(payload, Mapping):
        return PlanningResult(error=_fail("invalid_input", "That schedule is invalid."))

    schedule_id = payload.get("id")
    if not is_uuid(schedule_id):
        return PlanningResult(error=_fail("invalid_id", "That request has an invalid ID.", "id"))

    local_date = payload.get("localDate")
    error = _check_future_date(local_date, today)
    if error is not None:
        return PlanningResult(error=error)

    assert isinstance(local_date, str)  # guaranteed by _check_future_date
    return PlanningResult(data=RescheduleInput(id=schedule_id, local_date=local_date))


def can_change_schedule(status: ScheduleStatus) -> bool:
    """Only upcoming plans can move or be canceled; finished records stay as they are."""
    return status == "planned"

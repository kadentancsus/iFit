"""Scheduling, rescheduling and canceling planned workouts.

Only planned rows can change; completed and canceled rows are kept as history.
There is deliberately no "missed" state.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from typing import Any

from postgrest import AsyncPostgrestClient
from postgrest.exceptions import APIError

from app.contracts.planning import ScheduledWorkout
from app.core.responses import ApiError

from .database import run
from .service import routine_not_found
from .validators import (
    can_change_schedule,
    is_local_date,
    is_uuid,
    validate_reschedule_input,
    validate_schedule_input,
)

_COLUMNS = (
    "id,owner_id,routine_id,routine_title,local_date,status,created_at,updated_at,routines(title)"
)
#: How far ahead a workout can be planned.
MAX_DAYS_AHEAD = 366

_UNIQUE_VIOLATION = "23505"
#: Raised by the database while a workout started from the plan is running.
_IN_PROGRESS = "55006"
#: An RLS rejection or a missing routine both mean the routine isn't the caller's.
_ROUTINE_GONE = {"42501", "23502", "23503"}


def earliest_today(now: datetime | None = None) -> date:
    """The calendar date in the last time zone on Earth (UTC-12).

    The API doesn't know the user's own date for sure, so it rejects only dates
    that are already past everywhere. The app checks the user's exact local date.
    """
    return ((now or datetime.now(UTC)) - timedelta(hours=12)).date()


def _check_horizon(local_date: str, today: date) -> None:
    if date.fromisoformat(local_date) > today + timedelta(days=MAX_DAYS_AHEAD):
        raise ApiError(
            422, "invalid_date", "Choose a date within the next year.", field="localDate"
        )


def _to_workout(row: dict[str, Any]) -> ScheduledWorkout:
    routine = row.get("routines")
    return ScheduledWorkout(
        id=row["id"],
        owner_id=row["owner_id"],
        routine_id=row["routine_id"],
        routine_title=routine["title"] if routine else row["routine_title"],
        local_date=row["local_date"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "We couldn't find that planned workout.")


def _routine_missing() -> ApiError:
    error = routine_not_found()
    error.field = "routineId"
    return error


def _already_planned() -> ApiError:
    return ApiError(
        409,
        "duplicate_entry",
        "That routine is already planned for that day.",
        field="localDate",
    )


async def list_schedule(
    db: AsyncPostgrestClient, *, start: str | None = None, end: str | None = None
) -> list[ScheduledWorkout]:
    query = db.table("scheduled_workouts").select(_COLUMNS)
    for name, value, operator in (("fromDate", start, "gte"), ("toDate", end, "lte")):
        if value is None:
            continue
        if not is_local_date(value):
            raise ApiError(422, "invalid_date", "Choose a valid date.", field=name)
        query = query.filter("local_date", operator, value)
    rows = await run(query.order("local_date").order("created_at"))
    return [_to_workout(row) for row in rows]


async def _get_row(db: AsyncPostgrestClient, schedule_id: str) -> dict[str, Any]:
    if not is_uuid(schedule_id):
        raise ApiError(422, "invalid_id", "That request has an invalid ID.", field="scheduleId")
    rows = await run(db.table("scheduled_workouts").select(_COLUMNS).eq("id", schedule_id))
    if not rows:
        raise _not_found()
    row: dict[str, Any] = rows[0]
    return row


def _locked() -> ApiError:
    return ApiError(
        409,
        "conflict",
        "Only upcoming workouts can be changed. Finished and canceled ones stay as they are.",
    )


def _in_progress() -> ApiError:
    return ApiError(
        409,
        "conflict",
        "This workout is in progress. Finish it before moving or canceling it.",
    )


def _require_planned(row: dict[str, Any]) -> None:
    if not can_change_schedule(row["status"]):
        raise _locked()


async def schedule_routine(
    db: AsyncPostgrestClient, payload: object, *, now: datetime | None = None
) -> ScheduledWorkout:
    today = earliest_today(now)
    result = validate_schedule_input(payload, today.isoformat())
    if result.error is not None:
        raise ApiError(422, result.error.code, result.error.message, field=result.error.field)
    assert result.data is not None
    plan = result.data
    _check_horizon(plan.local_date, today)

    owned = await run(db.table("routines").select("id").eq("id", plan.routine_id))
    if not owned:
        raise _routine_missing()

    try:
        rows = await run(
            db.table("scheduled_workouts").insert(
                {
                    "routine_id": plan.routine_id,
                    "local_date": plan.local_date,
                    "operation_id": plan.operation_id,
                }
            ),
            expected={_UNIQUE_VIOLATION, *_ROUTINE_GONE},
        )
    except APIError as error:
        if error.code in _ROUTINE_GONE:
            raise _routine_missing() from None
        if "operation" in (error.message or "") and plan.operation_id is not None:
            # A retry of a request that already succeeded: return the first result.
            rows = await run(
                db.table("scheduled_workouts").select(_COLUMNS).eq("operation_id", plan.operation_id)
            )
            if rows:
                return _to_workout(rows[0])
        raise _already_planned() from None

    return _to_workout(await _get_row(db, rows[0]["id"]))


async def reschedule_workout(
    db: AsyncPostgrestClient,
    schedule_id: str,
    payload: object,
    *,
    now: datetime | None = None,
) -> ScheduledWorkout:
    today = earliest_today(now)
    local_date = payload.get("localDate") if isinstance(payload, Mapping) else None
    result = validate_reschedule_input(
        {"id": schedule_id, "localDate": local_date}, today.isoformat()
    )
    if result.error is not None:
        raise ApiError(422, result.error.code, result.error.message, field=result.error.field)
    assert result.data is not None
    _check_horizon(result.data.local_date, today)

    _require_planned(await _get_row(db, schedule_id))
    try:
        rows = await run(
            db.table("scheduled_workouts")
            .update({"local_date": result.data.local_date})
            .eq("id", schedule_id)
            .eq("status", "planned"),
            expected={_UNIQUE_VIOLATION, _IN_PROGRESS},
        )
    except APIError as error:
        if error.code == _IN_PROGRESS:
            raise _in_progress() from None
        raise _already_planned() from None
    if not rows:
        # It was finished or canceled between the check and the update.
        raise _locked()
    return _to_workout(await _get_row(db, schedule_id))


async def cancel_scheduled_workout(
    db: AsyncPostgrestClient, schedule_id: str
) -> ScheduledWorkout:
    """Canceling twice is harmless: the second call returns the canceled plan."""
    row = await _get_row(db, schedule_id)
    if row["status"] == "canceled":
        return _to_workout(row)
    _require_planned(row)
    # Filtering on status keeps a plan finished meanwhile from being canceled;
    # rereading then reports whatever state it ended up in.
    try:
        await run(
            db.table("scheduled_workouts")
            .update({"status": "canceled"})
            .eq("id", schedule_id)
            .eq("status", "planned"),
            expected={_IN_PROGRESS},
        )
    except APIError:
        raise _in_progress() from None
    return _to_workout(await _get_row(db, schedule_id))

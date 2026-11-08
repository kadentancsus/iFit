"""Workout persistence through the caller's request-scoped PostgREST client.

RPCs perform transactional writes and recheck auth.uid(). Reads explicitly scope
by the verified account as well as relying on RLS. No service-role access.
"""

from collections.abc import Awaitable
from typing import Any, TypeVar
from uuid import UUID

import httpx
from postgrest import AsyncPostgrestClient
from postgrest.exceptions import APIError

from app.contracts.catalog import LastPerformance
from app.contracts.workout import WorkoutDetail, WorkoutExercise
from app.core.responses import ApiError

from .schemas import LogSetInput, SessionExercise, SetLog, StartWorkoutInput, WorkoutSession

T = TypeVar("T")


def rows(value: object) -> list[dict[str, Any]]:
    if isinstance(value, list) and all(isinstance(row, dict) for row in value):
        return value
    raise ApiError(503, "request_failed", "Workout storage returned an unexpected response.")


def rpc_row(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    result = rows(value)
    if not result:
        raise ApiError(503, "request_failed", "Workout storage returned an empty response.")
    return result[0]


async def database_call(call: Awaitable[T]) -> T:
    """Map database errors to stable, non-sensitive API failures."""
    try:
        return await call
    except APIError as error:
        if error.code == "P0002":
            raise ApiError(404, "not_found", "That workout record was not found.") from None
        if error.code in ("42501", "28000"):
            raise ApiError(403, "forbidden", "You cannot access that workout.") from None
        if error.code in ("22023", "23505"):
            raise ApiError(
                409, "conflict", "The workout changed. Refresh and review before retrying."
            ) from None
        if error.code in ("23514", "23502", "22P02", "22003"):
            raise ApiError(
                422, "invalid_input", "Check the workout values and try again."
            ) from None
        raise ApiError(
            503, "request_failed", "Workout storage is unavailable. Try again."
        ) from None
    except httpx.HTTPError:
        raise ApiError(
            503,
            "request_failed",
            "We couldn't confirm the save. Retry without changing the values.",
        ) from None


def session_model(row: dict[str, Any]) -> WorkoutSession:
    return WorkoutSession.model_validate(
        {
            key: row[key]
            for key in (
                "id",
                "owner_id",
                "routine_id",
                "schedule_id",
                "routine_name_snapshot",
                "operation_id",
                "started_at",
                "ended_at",
                "status",
                "created_at",
                "updated_at",
            )
        }
        | {
            "rest_state": {
                "status": row["rest_status"],
                "ends_at": row["rest_ends_at"],
                "remaining_seconds": row["rest_remaining_seconds"],
            }
        }
    )


def exercise_model(row: dict[str, Any]) -> SessionExercise:
    return SessionExercise.model_validate(
        {
            key: row[key]
            for key in (
                "id",
                "session_id",
                "exercise_id",
                "exercise_name_snapshot",
                "load_convention_snapshot",
                "position",
                "replaced_entry_id",
                "is_replaced",
                "created_at",
                "updated_at",
            )
        }
        | {
            "targets": {
                key: row[key]
                for key in (
                    "target_sets",
                    "target_reps",
                    "target_kg",
                    "rest_seconds",
                )
            }
        }
    )


def set_model(row: dict[str, Any]) -> SetLog:
    # owner_id is private persistence metadata, not a request/response field.
    return SetLog.model_validate({key: value for key, value in row.items() if key != "owner_id"})


class WorkoutService:
    def __init__(self, db: AsyncPostgrestClient, owner_id: str) -> None:
        self.db = db
        self.owner_id = owner_id

    async def get_workout(self, session_id: UUID) -> WorkoutDetail:
        response = await database_call(
            self.db.table("workout_sessions")
            .select("*")
            .eq("owner_id", self.owner_id)
            .eq("id", str(session_id))
            .limit(1)
            .execute()
        )
        if not response.data:
            raise ApiError(404, "not_found", "That workout was not found.")
        session = session_model(rows(response.data)[0])
        entries = await database_call(
            self.db.table("session_exercises")
            .select("*")
            .eq("owner_id", self.owner_id)
            .eq("session_id", str(session_id))
            .order("position")
            .execute()
        )
        exercises = []
        for row in rows(entries.data):
            entry = exercise_model(row)
            logs = await database_call(
                self.db.table("set_logs")
                .select("*")
                .eq("owner_id", self.owner_id)
                .eq("session_exercise_id", str(entry.id))
                .order("ordinal")
                .execute()
            )
            # An exact-exercise and load-convention match only. Exclude this
            # session's entries, deleted sets, and results logged after its start.
            prior = await database_call(
                self.db.table("set_logs")
                .select(
                    "reps,weight_kg,load_mode,completed_at,session_exercises!inner(exercise_id,session_id,load_convention_snapshot)"
                )
                .eq("owner_id", self.owner_id)
                .eq("is_deleted", False)
                .eq("session_exercises.exercise_id", str(entry.exercise_id))
                .eq("session_exercises.load_convention_snapshot", entry.load_convention_snapshot)
                .neq("session_exercises.session_id", str(session_id))
                .lt("completed_at", session.started_at.isoformat())
                .order("completed_at", desc=True)
                .limit(1)
                .execute()
            )
            last = None
            if prior.data:
                last = LastPerformance.model_validate(
                    {
                        key: rows(prior.data)[0][key]
                        for key in ("reps", "weight_kg", "load_mode", "completed_at")
                    }
                )
            exercises.append(
                WorkoutExercise(
                    entry=entry,
                    sets=tuple(set_model(log) for log in rows(logs.data)),
                    last_performance=last,
                )
            )
        return WorkoutDetail(session=session, exercises=tuple(exercises))

    async def get_active(self) -> WorkoutDetail | None:
        result = await database_call(
            self.db.table("workout_sessions")
            .select("id")
            .eq("owner_id", self.owner_id)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return await self.get_workout(UUID(rows(result.data)[0]["id"])) if result.data else None

    async def start(self, payload: StartWorkoutInput) -> WorkoutDetail:
        params: dict[str, Any] = {
            "p_routine_id": str(payload.routine_id),
            "p_operation_id": str(payload.operation_id),
            "p_schedule_id": str(payload.schedule_id) if payload.schedule_id else None,
        }
        result = await database_call(
            self.db.rpc(
                "workout_start",
                params,
            ).execute()
        )
        row = rpc_row(result.data)
        return await self.get_workout(UUID(row["id"]))

    async def log_set(self, payload: LogSetInput) -> SetLog:
        params: dict[str, Any] = {
            "p_session_exercise_id": str(payload.session_exercise_id),
            "p_reps": payload.reps,
            "p_weight_kg": payload.weight_kg,
            "p_load_mode": payload.load_mode,
            "p_operation_id": str(payload.operation_id),
        }
        result = await database_call(
            self.db.rpc(
                "workout_log_set",
                params,
            ).execute()
        )
        row = rpc_row(result.data)
        return set_model(row)

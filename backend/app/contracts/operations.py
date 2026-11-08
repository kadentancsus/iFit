"""REST paths for every operation in the team contract.

Paths are relative to ``/api/v1``. Each lane mounts its endpoints at exactly
these method/path pairs; the frontend's ``API_ROUTES`` in
``frontend/src/lib/contracts.ts`` lists the same table and a test keeps the two
identical. ``saveRoutine`` is split into create (POST) and update (PUT).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
Lane = Literal["kaden", "sukhdip", "sina"]


@dataclass(frozen=True)
class Operation:
    name: str
    method: HttpMethod
    path: str
    lane: Lane


OPERATIONS: Final[tuple[Operation, ...]] = (
    # Identity and dashboard
    Operation("getSession", "GET", "/session", "kaden"),
    Operation("getDashboard", "GET", "/dashboard", "kaden"),
    Operation("getProfile", "GET", "/profile", "kaden"),
    Operation("updateProfile", "PATCH", "/profile", "kaden"),
    # Catalog
    Operation("listExercises", "GET", "/exercises", "sukhdip"),
    Operation("getExercise", "GET", "/exercises/{exerciseId}", "sukhdip"),
    Operation("getAlternatives", "GET", "/exercises/{exerciseId}/alternatives", "sukhdip"),
    # Routines
    Operation("listRoutines", "GET", "/routines", "sukhdip"),
    Operation("getRoutine", "GET", "/routines/{routineId}", "sukhdip"),
    Operation("createRoutine", "POST", "/routines", "sukhdip"),
    Operation("updateRoutine", "PUT", "/routines/{routineId}", "sukhdip"),
    Operation("deleteRoutine", "DELETE", "/routines/{routineId}", "sukhdip"),
    # Schedule
    Operation("listScheduledWorkouts", "GET", "/schedule", "sukhdip"),
    Operation("scheduleRoutine", "POST", "/schedule", "sukhdip"),
    Operation("rescheduleWorkout", "PATCH", "/schedule/{scheduleId}", "sukhdip"),
    Operation("cancelScheduledWorkout", "POST", "/schedule/{scheduleId}/cancel", "sukhdip"),
    # Workouts
    Operation("startWorkout", "POST", "/workouts", "sina"),
    Operation("getActiveWorkout", "GET", "/workouts/active", "sina"),
    Operation("getWorkout", "GET", "/workouts/{sessionId}", "sina"),
    Operation("logSet", "POST", "/sets", "sina"),
    Operation("updateSet", "PATCH", "/sets/{setId}", "sina"),
    Operation("deleteSet", "DELETE", "/sets/{setId}", "sina"),
    Operation("swapExercise", "POST", "/swaps", "sina"),
    Operation("saveRestState", "PUT", "/workouts/{sessionId}/rest", "sina"),
    Operation("finishWorkout", "POST", "/workouts/{sessionId}/finish", "sina"),
    # History
    Operation("listHistory", "GET", "/history", "sina"),
    Operation("getProgress", "GET", "/progress/{exerciseId}", "sina"),
)

OPERATIONS_BY_NAME: Final = {operation.name: operation for operation in OPERATIONS}

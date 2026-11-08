"""Routine and schedule API schemas.

Limits match the CHECK constraints in ``supabase/migrations/0002_planning.sql``
and the frontend copy in ``frontend/src/features/planning/types.ts``; change
all three together. JSON field names are camelCase to match the frontend.
"""

from __future__ import annotations

from datetime import datetime
from typing import Final, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

ROUTINE_TITLE_LENGTH: Final = 80
ROUTINE_MAX_EXERCISES: Final = 30
ROUTINE_MAX_SETS: Final = 20
ROUTINE_MAX_REPS: Final = 100
ROUTINE_MAX_KG: Final = 1000
ROUTINE_MAX_REST_SECONDS: Final = 600

ScheduleStatus = Literal["planned", "completed", "canceled"]
# There is intentionally no `missed` status: unfinished plans are not judged.
SCHEDULE_STATUSES: Final[tuple[ScheduleStatus, ...]] = ("planned", "completed", "canceled")

# Matches the load_convention CHECK in 0002_planning.sql.
LoadConvention = Literal["total", "per_dumbbell", "machine", "bodyweight"]

# Matches the equipment CHECK in 0002_planning.sql.
Equipment = Literal["barbell", "dumbbell", "machine", "cable", "bodyweight"]
MovementPattern = Literal["push", "pull", "squat", "hinge", "core"]
# Matches MUSCLES in frontend/src/features/catalog/types.ts.
Muscle = Literal[
    "chest",
    "shoulders",
    "triceps",
    "lats",
    "upper back",
    "biceps",
    "quads",
    "glutes",
    "hamstrings",
    "core",
    "lower back",
]

PlanningErrorCode = Literal[
    "invalid_input",
    "invalid_id",
    "invalid_title",
    "invalid_target",
    "invalid_date",
    "date_in_past",
    "unknown_exercise",
    "load_not_applicable",
    "too_many_exercises",
    "duplicate_entry",
]


class CamelModel(BaseModel):
    """Serializes as camelCase JSON and drops unset optional fields."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class ExerciseRef(CamelModel):
    """The catalog facts a routine validator needs about one exercise."""

    id: str
    name: str
    load_convention: LoadConvention


class RoutineExerciseInput(CamelModel):
    #: Present when editing a row that already exists.
    id: str | None = None
    exercise_id: str
    target_sets: int
    target_reps: int
    #: Canonical kilograms. None means no planned load.
    target_kg: float | None
    rest_seconds: int


class RoutineInput(CamelModel):
    #: Present when editing a routine that already exists.
    id: str | None = None
    title: str
    #: List order is the routine order.
    exercises: tuple[RoutineExerciseInput, ...]
    operation_id: str | None = None


class ScheduleInput(CamelModel):
    routine_id: str
    #: The user's calendar date as ``YYYY-MM-DD``.
    local_date: str
    operation_id: str | None = None


class RescheduleInput(CamelModel):
    id: str
    local_date: str


class RoutineExerciseView(CamelModel):
    """One planned exercise, with the catalog facts the routine editor shows."""

    id: str
    exercise_id: str
    exercise_name: str
    equipment: Equipment
    load_convention: LoadConvention
    position: int
    target_sets: int
    target_reps: int
    #: Canonical kilograms. None means no planned load.
    target_kg: float | None
    rest_seconds: int


class RoutineSummary(CamelModel):
    id: str
    title: str
    exercise_count: int
    updated_at: datetime


class RoutineDetail(CamelModel):
    id: str
    title: str
    updated_at: datetime
    #: In routine order.
    exercises: tuple[RoutineExerciseView, ...]


class DeletedRoutine(CamelModel):
    id: str


class ScheduledWorkout(CamelModel):
    id: str
    #: None once the routine has been deleted.
    routine_id: str | None
    #: The routine's current name, or its last name if it was deleted.
    routine_title: str
    local_date: str
    status: ScheduleStatus


class ExerciseSummary(CamelModel):
    id: str
    slug: str
    name: str
    pattern: MovementPattern
    primary_muscles: tuple[Muscle, ...]
    secondary_muscles: tuple[Muscle, ...]
    equipment: Equipment
    load_convention: LoadConvention
    difficulty: int
    summary: str
    asset_path: str
    asset_alt: str


class ExerciseDetail(ExerciseSummary):
    instructions: tuple[str, ...]
    #: Exactly three, short enough to read between sets.
    cues: tuple[str, ...]
    mistakes: tuple[str, ...]
    #: Looping demonstration. Show asset_path instead when motion is reduced.
    motion_asset_path: str


class PlanningError(CamelModel):
    code: PlanningErrorCode
    #: Safe to show to the user.
    message: str
    #: Dotted path to the failing input, such as ``exercises.0.targetReps``.
    field: str | None = None


T = TypeVar("T")


class PlanningResult(CamelModel, Generic[T]):
    """The shared ``{ data, error }`` result: exactly one of the two is set."""

    data: T | None = None
    error: PlanningError | None = None

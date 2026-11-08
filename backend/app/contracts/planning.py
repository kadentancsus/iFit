"""Routine and schedule contracts (Sukhdip's lane implements the endpoints).

Request bodies are the planning lane's own models, re-exported so there is one
definition; this module adds the response shapes.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import AwareDatetime

from app.contracts.common import ContractModel, Kilograms, LoadConvention, LocalDate, ScheduleStatus
from app.features.planning.schemas import (
    RescheduleInput as RescheduleInput,
)
from app.features.planning.schemas import (
    RoutineExerciseInput as RoutineExerciseInput,
)
from app.features.planning.schemas import (
    RoutineInput as RoutineInput,
)
from app.features.planning.schemas import (
    ScheduleInput as ScheduleInput,
)


class RoutineExercise(ContractModel):
    id: UUID
    routine_id: UUID
    exercise_id: UUID
    exercise_name: str
    load_convention: LoadConvention
    position: int
    target_sets: int
    target_reps: int
    #: Canonical kilograms; None means no planned load.
    target_kg: Kilograms | None
    rest_seconds: int


class RoutineSummary(ContractModel):
    """One row of ``listRoutines``."""

    id: UUID
    title: str
    exercise_count: int
    updated_at: AwareDatetime


class Routine(ContractModel):
    """``getRoutine`` and ``saveRoutine`` result."""

    id: UUID
    owner_id: UUID
    title: str
    exercises: tuple[RoutineExercise, ...]
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ScheduledWorkout(ContractModel):
    id: UUID
    owner_id: UUID
    routine_id: UUID
    #: Current title of the routine, for display.
    routine_title: str
    local_date: LocalDate
    status: ScheduleStatus
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ScheduleRange(ContractModel):
    """Query parameters for ``listScheduledWorkouts`` (inclusive local dates)."""

    from_date: LocalDate
    to_date: LocalDate

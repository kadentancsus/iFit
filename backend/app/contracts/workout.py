"""Workout, history and progress contracts (Sina's lane implements the endpoints).

Session, set and rest models are the workout lane's own, re-exported so there
is one definition; this module adds the remaining inputs and response shapes.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, Field

from app.contracts.catalog import LastPerformance
from app.contracts.common import ContractModel, Kilograms, LoadConvention, LocalDate, SessionStatus
from app.features.workout.schemas import (
    LogSetInput as LogSetInput,
)
from app.features.workout.schemas import (
    RemainingTargets as RemainingTargets,
)
from app.features.workout.schemas import (
    RestState as RestState,
)
from app.features.workout.schemas import (
    SessionExercise as SessionExercise,
)
from app.features.workout.schemas import (
    SetLog as SetLog,
)
from app.features.workout.schemas import (
    StartWorkoutInput as StartWorkoutInput,
)
from app.features.workout.schemas import (
    Targets as Targets,
)
from app.features.workout.schemas import (
    UpdateSetInput as UpdateSetInput,
)
from app.features.workout.schemas import (
    WorkoutSession as WorkoutSession,
)


class WorkoutExercise(ContractModel):
    """One exercise entry in a session, with its logged sets."""

    entry: SessionExercise
    sets: tuple[SetLog, ...]
    #: Most recent earlier result for this exact exercise, to prefill the form.
    last_performance: LastPerformance | None = None


class WorkoutDetail(ContractModel):
    """``startWorkout``, ``getActiveWorkout`` and ``getWorkout`` result."""

    session: WorkoutSession
    #: In position order. Replaced entries stay, linked by ``replacedEntryId``.
    exercises: tuple[WorkoutExercise, ...]


class SwapExerciseInput(ContractModel):
    session_exercise_id: UUID
    replacement_exercise_id: UUID
    #: Sets still to do move to the replacement; logged sets stay put.
    remaining_targets: RemainingTargets
    operation_id: UUID


class SwapResult(ContractModel):
    #: The original entry, which keeps its logged sets.
    replaced: SessionExercise
    #: The new entry for the remaining work.
    replacement: SessionExercise


class FinishWorkoutInput(ContractModel):
    operation_id: UUID


class WorkoutSummary(ContractModel):
    """One row of ``listHistory`` and the dashboard's recent sessions."""

    id: UUID
    routine_name_snapshot: str
    status: SessionStatus
    started_at: AwareDatetime
    ended_at: AwareDatetime | None
    duration_seconds: int | None
    exercise_count: int
    set_count: int
    #: Sum of reps x kg over weighted sets only. Bodyweight sets are excluded,
    #: never counted as zero; None when there are no weighted sets.
    weighted_volume_kg: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None


class ProgressPoint(ContractModel):
    session_id: UUID
    #: Local date the session started.
    local_date: LocalDate
    best_reps: int
    #: Heaviest weighted set that day; None for bodyweight-only days.
    best_weight_kg: Kilograms | None
    weighted_volume_kg: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None


class ExerciseProgress(ContractModel):
    """``getProgress`` result. Only comparable within one load convention."""

    exercise_id: UUID
    exercise_name: str
    load_convention: LoadConvention
    points: tuple[ProgressPoint, ...]

"""Lane-owned workout models. JSON uses camelCase; loads are canonical kg.

These models deliberately do not depend on unpublished shared contracts.
Ownership and active-session uniqueness must also be enforced by persistence.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

PositiveReps = Annotated[int, Field(strict=True, ge=1, le=100)]
SetCount = Annotated[int, Field(strict=True, ge=1, le=20)]
Kilograms = Annotated[float, Field(strict=True, ge=0, le=1000, allow_inf_nan=False)]
RestSeconds = Annotated[int, Field(strict=True, ge=0, le=600)]
LoadMode = Literal["weighted", "bodyweight"]
SessionStatus = Literal["active", "completed", "stopped"]
LoadConvention = Literal["total", "per_dumbbell", "machine", "bodyweight"]


class WorkoutModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, frozen=True, extra="forbid"
    )

    @model_validator(mode="after")
    def utc_timestamps(self) -> Self:
        for name in type(self).model_fields:
            value = getattr(self, name)
            if isinstance(value, datetime) and value.utcoffset() != timedelta(0):
                raise ValueError("Timestamps must use UTC.")
        return self


class Targets(WorkoutModel):
    target_sets: SetCount
    target_reps: PositiveReps
    target_kg: Kilograms | None = None
    rest_seconds: RestSeconds


class StartWorkoutInput(WorkoutModel):
    routine_id: UUID
    schedule_id: UUID | None = None
    operation_id: UUID


class SetValues(WorkoutModel):
    reps: PositiveReps
    weight_kg: Kilograms | None
    load_mode: LoadMode

    @model_validator(mode="after")
    def valid_load(self) -> Self:
        if (self.load_mode == "bodyweight") != (self.weight_kg is None):
            raise ValueError("Bodyweight uses no kg; weighted sets require explicit kg.")
        return self


class LogSetInput(SetValues):
    session_exercise_id: UUID
    operation_id: UUID


class UpdateSetInput(SetValues):
    """A correction submits all actual values together to avoid mixed load modes."""


class SetLog(SetValues):
    id: UUID
    session_exercise_id: UUID
    operation_id: UUID
    ordinal: Annotated[int, Field(strict=True, ge=1)]
    completed_at: AwareDatetime
    created_at: AwareDatetime
    updated_at: AwareDatetime


class RestState(WorkoutModel):
    """Running uses an absolute deadline; paused uses a frozen remainder."""

    status: Literal["running", "paused", "idle"]
    ends_at: AwareDatetime | None = None
    remaining_seconds: RestSeconds = 0

    @model_validator(mode="after")
    def valid_state(self) -> Self:
        if self.status == "running":
            if self.ends_at is None or self.remaining_seconds != 0:
                raise ValueError("Running rest needs a deadline and no paused remainder.")
        elif self.ends_at is not None:
            raise ValueError("Only running rest has a deadline.")
        if self.status == "idle" and self.remaining_seconds != 0:
            raise ValueError("Idle rest cannot have remaining time.")
        return self


class SessionExercise(WorkoutModel):
    id: UUID
    session_id: UUID
    exercise_id: UUID
    exercise_name_snapshot: Annotated[str, Field(min_length=1, max_length=120)]
    load_convention_snapshot: LoadConvention
    position: Annotated[int, Field(strict=True, ge=0)]
    targets: Targets
    replaced_entry_id: UUID | None = None
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @model_validator(mode="after")
    def valid_snapshot(self) -> Self:
        if self.replaced_entry_id == self.id:
            raise ValueError("An exercise cannot replace itself.")
        if self.load_convention_snapshot == "bodyweight" and self.targets.target_kg is not None:
            raise ValueError("Bodyweight targets cannot contain a load.")
        return self


class WorkoutSession(WorkoutModel):
    id: UUID
    owner_id: UUID
    routine_id: UUID | None = None
    schedule_id: UUID | None = None
    routine_name_snapshot: Annotated[str, Field(min_length=1, max_length=80)]
    operation_id: UUID
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    status: SessionStatus
    rest_state: RestState
    created_at: AwareDatetime
    updated_at: AwareDatetime

    @model_validator(mode="after")
    def valid_end(self) -> Self:
        if (self.status == "active") != (self.ended_at is None):
            raise ValueError("Active sessions have no end; closed sessions require one.")
        if self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("A session cannot end before it starts.")
        if self.status != "active" and self.rest_state.status != "idle":
            raise ValueError("Closed sessions cannot retain an active rest timer.")
        return self

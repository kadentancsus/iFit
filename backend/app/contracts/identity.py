"""Identity, profile and dashboard contracts (Kaden's lane)."""

from __future__ import annotations

from typing import Annotated, Self
from uuid import UUID

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.contracts.common import ContractModel, DisplayUnit, LocalDate, TimeZoneName
from app.contracts.planning import ScheduledWorkout
from app.contracts.workout import WorkoutSummary

#: Matches the CHECK constraint in 0001_identity.sql (1-50, stored trimmed).
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class SessionInfo(ContractModel):
    """``GET /session``: who the API thinks is signed in."""

    user_id: str
    email: str | None


class Profile(ContractModel):
    user_id: UUID
    display_name: str
    display_unit: DisplayUnit
    timezone: str
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ProfileUpdate(ContractModel):
    """``updateProfile`` body. Send only the fields that change."""

    display_name: DisplayName | None = None
    display_unit: DisplayUnit | None = None
    timezone: TimeZoneName | None = None

    @model_validator(mode="after")
    def _has_a_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("send at least one field to change")
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be cleared")
        return self


class ActiveWorkoutRef(ContractModel):
    id: UUID
    routine_name_snapshot: str
    started_at: AwareDatetime


class ProgressSummary(ContractModel):
    """Private counts from the user's own completed sessions."""

    sessions_last_7_days: Annotated[int, Field(ge=0)]
    sessions_last_30_days: Annotated[int, Field(ge=0)]
    sets_last_7_days: Annotated[int, Field(ge=0)]


class Dashboard(ContractModel):
    """``getDashboard`` result."""

    profile: Profile
    #: Today in the profile's time zone.
    today: LocalDate
    todays_workouts: tuple[ScheduledWorkout, ...]
    upcoming_workouts: tuple[ScheduledWorkout, ...]
    active_workout: ActiveWorkoutRef | None
    recent_sessions: tuple[WorkoutSummary, ...]
    progress: ProgressSummary

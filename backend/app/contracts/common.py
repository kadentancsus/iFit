"""Shared building blocks for the API contracts.

JSON field names are camelCase. String unions here are mirrored, value for
value, by ``frontend/src/lib/contracts.ts``; ``tests/contracts`` fails if the
two drift apart.
"""

from __future__ import annotations

from typing import Annotated, Final, Literal, get_args

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.dates import is_local_date, is_valid_timezone
from app.core.units import DisplayUnit as DisplayUnit


class ContractModel(BaseModel):
    """Base for every request and response body: camelCase JSON, immutable,
    unknown fields rejected."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, frozen=True, extra="forbid"
    )


LoadConvention = Literal["total", "per_dumbbell", "machine", "bodyweight"]
LoadMode = Literal["weighted", "bodyweight"]
SessionStatus = Literal["active", "completed", "stopped"]
#: There is intentionally no ``missed`` status: unfinished plans are not judged.
ScheduleStatus = Literal["planned", "completed", "canceled"]
AlternativeKind = Literal["substitution", "regression"]
Equipment = Literal["barbell", "dumbbell", "machine", "cable", "bodyweight"]
MovementPattern = Literal["push", "pull", "squat", "hinge", "core"]
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

#: Every stable ``error.code`` the API can return. Feature code adds new codes
#: here (and in contracts.ts) rather than inventing them inline.
ErrorCode = Literal[
    # Request and session
    "bad_request",
    "invalid_input",
    "not_authenticated",
    "invalid_session",
    "auth_unavailable",
    "forbidden",
    "not_found",
    "method_not_allowed",
    "payload_too_large",
    "rate_limited",
    "request_failed",
    "internal_error",
    # Planning
    "invalid_id",
    "invalid_title",
    "invalid_target",
    "invalid_date",
    "date_in_past",
    "unknown_exercise",
    "load_not_applicable",
    "too_many_exercises",
    "duplicate_entry",
    "database_unavailable",
    # Workout
    "session_closed",
    "active_session_exists",
    "conflict",
]

ERROR_CODES: Final = get_args(ErrorCode)


def _check_local_date(value: str) -> str:
    if not is_local_date(value):
        raise ValueError("must be a real date written as YYYY-MM-DD")
    return value


def _check_timezone(value: str) -> str:
    if not is_valid_timezone(value):
        raise ValueError("must be a time zone name such as America/Los_Angeles")
    return value


#: The user's calendar date, ``YYYY-MM-DD``.
LocalDate = Annotated[str, Field(strict=True), AfterValidator(_check_local_date)]
#: An IANA time zone name.
TimeZoneName = Annotated[str, Field(strict=True), AfterValidator(_check_timezone)]
#: Canonical kilograms: finite, 0-1000.
Kilograms = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]

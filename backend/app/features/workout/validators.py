"""Safe request-validation results, independent of the API scaffold."""

from typing import Literal, TypeVar

from pydantic import ValidationError

from .schemas import WorkoutModel


class WorkoutError(WorkoutModel):
    code: Literal["invalid_input", "session_closed", "load_not_applicable"]
    message: str
    field: str | None = None


T = TypeVar("T", bound=WorkoutModel)


def validate_input(model: type[T], payload: object) -> tuple[T | None, WorkoutError | None]:
    """Reject malformed requests without echoing raw values or internal errors."""
    try:
        return model.model_validate(payload), None
    except ValidationError as exc:
        first = exc.errors(include_input=False)[0]
        return None, WorkoutError(
            code="invalid_input",
            message="Check the workout values and try again.",
            field=".".join(str(part) for part in first["loc"]) or None,
        )


def validate_set_context(
    *, session_status: str, load_convention: str, load_mode: str
) -> WorkoutError | None:
    """Call using server-loaded session/catalog facts, never client assertions."""
    if session_status not in ("active", "completed", "stopped"):
        return WorkoutError(code="invalid_input", message="That workout status is invalid.")
    # Completed records intentionally remain editable; stopped sessions do not.
    if session_status == "stopped":
        return WorkoutError(code="session_closed", message="This workout was stopped.")
    if load_convention not in ("total", "per_dumbbell", "machine", "bodyweight"):
        return WorkoutError(code="invalid_input", message="That exercise load is invalid.")
    expected_mode = "bodyweight" if load_convention == "bodyweight" else "weighted"
    if load_mode != expected_mode:
        return WorkoutError(
            code="load_not_applicable",
            message="Use the load mode for this exercise.",
            field="loadMode",
        )
    return None

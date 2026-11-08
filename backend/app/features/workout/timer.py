"""Pure timestamp-based rest transitions; callers persist the returned state."""

import math
from datetime import datetime, timedelta

from .schemas import RestState


def _check_now(now: datetime) -> None:
    if now.utcoffset() != timedelta(0):
        raise ValueError("now must be a UTC-aware timestamp.")


def remaining_seconds(state: RestState, now: datetime) -> int:
    _check_now(now)
    if state.status == "running":
        assert state.ends_at is not None
        return max(0, min(600, math.ceil((state.ends_at - now).total_seconds())))
    return state.remaining_seconds


def start_rest(seconds: int, now: datetime) -> RestState:
    _check_now(now)
    # Validate before calculating, including rejecting booleans and fractions.
    validated = RestState(status="paused", remaining_seconds=seconds)
    if validated.remaining_seconds == 0:
        return skip_rest()
    return RestState(status="running", ends_at=now + timedelta(seconds=seconds))


def pause_rest(state: RestState, now: datetime) -> RestState:
    seconds = remaining_seconds(state, now)
    return RestState(status="paused", remaining_seconds=seconds) if seconds else skip_rest()


def resume_rest(state: RestState, now: datetime) -> RestState:
    _check_now(now)
    if state.status != "paused":
        return state
    return start_rest(state.remaining_seconds, now)


def extend_rest(state: RestState, now: datetime) -> RestState:
    seconds = remaining_seconds(state, now)
    if not seconds:
        return skip_rest()
    seconds = min(600, seconds + 30)
    if state.status == "paused":
        return RestState(status="paused", remaining_seconds=seconds)
    return start_rest(seconds, now)


def skip_rest() -> RestState:
    return RestState(status="idle")

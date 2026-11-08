"""Deterministic clock/reload regression matrix for the workout foundation."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.features.workout.schemas import RestState, SessionExercise
from app.features.workout.timer import (
    extend_rest,
    pause_rest,
    remaining_seconds,
    resume_rest,
    skip_rest,
    start_rest,
)

NOW = datetime(2026, 11, 7, 12, tzinfo=UTC)
ID = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize("duration", [0, 1, 30, 90, 599, 600])
@pytest.mark.parametrize("elapsed", [0, 0.001, 1, 29.9, 90, 600, 3600])
def test_reload_matches_elapsed_wall_clock(duration: int, elapsed: float) -> None:
    import math

    state = start_rest(duration, NOW)
    reloaded = RestState.model_validate_json(state.model_dump_json(by_alias=True))
    later = NOW + timedelta(seconds=elapsed)
    assert remaining_seconds(reloaded, later) == max(0, math.ceil(duration - elapsed))
    assert remaining_seconds(pause_rest(reloaded, later), later + timedelta(days=1)) == max(
        0, math.ceil(duration - elapsed)
    )


def test_repeated_pause_and_resume_do_not_restart_rest() -> None:
    state = start_rest(90, NOW)
    paused = pause_rest(state, NOW + timedelta(seconds=20))
    assert pause_rest(paused, NOW + timedelta(hours=1)) == paused
    resumed = resume_rest(paused, NOW + timedelta(hours=2))
    assert remaining_seconds(resumed, NOW + timedelta(hours=2, seconds=10)) == 60
    assert extend_rest(skip_rest(), NOW) == skip_rest()
    assert resume_rest(skip_rest(), NOW) == skip_rest()


def test_backward_clock_never_exceeds_timer_limit() -> None:
    assert remaining_seconds(start_rest(600, NOW), NOW - timedelta(days=1)) == 600


def test_snapshot_detaches_from_mutable_source_and_survives_serialization() -> None:
    targets = {"targetSets": 3, "targetReps": 10, "targetKg": 20, "restSeconds": 90}
    source = {
        "id": ID,
        "sessionId": ID,
        "exerciseId": ID,
        "exerciseNameSnapshot": "Bench press",
        "loadConventionSnapshot": "total",
        "position": 0,
        "targets": targets,
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    snapshot = SessionExercise.model_validate(source)
    targets["targetReps"] = 5
    restored = SessionExercise.model_validate_json(snapshot.model_dump_json(by_alias=True))
    assert restored.targets.target_reps == 10
    with pytest.raises(ValidationError):
        restored.targets.target_kg = 100  # type: ignore[misc]

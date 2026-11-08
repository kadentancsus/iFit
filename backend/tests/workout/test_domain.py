from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.features.workout.schemas import (
    LogSetInput,
    RestState,
    SessionExercise,
    StartWorkoutInput,
    Targets,
    WorkoutSession,
)
from app.features.workout.timer import (
    extend_rest,
    pause_rest,
    remaining_seconds,
    resume_rest,
    skip_rest,
    start_rest,
)
from app.features.workout.validators import validate_input, validate_set_context

ID = "11111111-1111-4111-8111-111111111111"
NOW = datetime(2026, 11, 7, 12, tzinfo=UTC)


def set_input() -> dict[str, object]:
    return dict(sessionExerciseId=ID, operationId=ID, reps=10, weightKg=20, loadMode="weighted")


@pytest.mark.parametrize("reps", [True, "10", 1.5, 0, 101])
def test_rejects_invalid_reps(reps: object) -> None:
    payload = set_input()
    payload["reps"] = reps
    data, error = validate_input(LogSetInput, payload)
    assert data is None and error is not None
    assert error.field == "reps"


@pytest.mark.parametrize("weight", [True, "20", -1, float("nan"), float("inf"), 1001, None])
def test_rejects_invalid_load(weight: object) -> None:
    payload = set_input()
    payload["weightKg"] = weight
    assert validate_input(LogSetInput, payload)[1] is not None


def test_load_modes_and_explicit_zero() -> None:
    payload = set_input()
    payload["weightKg"] = 0
    assert validate_input(LogSetInput, payload)[1] is None
    payload.update(loadMode="bodyweight", weightKg=None)
    assert validate_input(LogSetInput, payload)[1] is None
    payload["weightKg"] = 0
    assert validate_input(LogSetInput, payload)[1] is not None


def test_ids_operations_and_untrusted_owner() -> None:
    assert validate_input(StartWorkoutInput, {"routineId": ID})[1] is not None
    assert validate_input(StartWorkoutInput, {"routineId": "bad", "operationId": ID})[1]
    assert validate_input(
        StartWorkoutInput,
        {
            "routineId": ID,
            "operationId": ID,
            "ownerId": ID,
        },
    )[1]
    assert validate_input(StartWorkoutInput, {"routineId": ID, "operationId": ID})[1] is None


def test_targets_are_immutable_and_bounded() -> None:
    targets = Targets(target_sets=3, target_reps=10, target_kg=20, rest_seconds=90)
    with pytest.raises(ValidationError):
        targets.target_reps = 8  # type: ignore[misc]
    with pytest.raises(ValidationError):
        Targets(target_sets=21, target_reps=10, rest_seconds=90)


def test_completed_sets_remain_editable() -> None:
    assert (
        validate_set_context(
            session_status="completed", load_convention="per_dumbbell", load_mode="weighted"
        )
        is None
    )
    assert (
        validate_set_context(
            session_status="active", load_convention="bodyweight", load_mode="weighted"
        )
        is not None
    )


def test_timer_refresh_pause_resume_and_extension() -> None:
    running = start_rest(90, NOW)
    restored = RestState.model_validate_json(running.model_dump_json(by_alias=True))
    later = NOW + timedelta(seconds=30, milliseconds=100)
    assert remaining_seconds(restored, later) == 60
    paused = pause_rest(restored, later)
    assert remaining_seconds(paused, NOW + timedelta(hours=1)) == 60
    resumed = resume_rest(paused, NOW + timedelta(hours=1))
    assert remaining_seconds(resumed, NOW + timedelta(hours=1, seconds=15)) == 45
    assert remaining_seconds(extend_rest(paused, later), later) == 90
    assert remaining_seconds(extend_rest(running, NOW), NOW) == 120
    assert remaining_seconds(extend_rest(start_rest(590, NOW), NOW), NOW) == 600
    assert resume_rest(running, later) == running
    assert remaining_seconds(restored, NOW + timedelta(minutes=3)) == 0
    assert extend_rest(restored, NOW + timedelta(minutes=3)) == skip_rest()


@pytest.mark.parametrize("seconds", [True, -1, 1.5, 601])
def test_invalid_durations(seconds: int) -> None:
    with pytest.raises(ValidationError):
        start_rest(seconds, NOW)


def test_invalid_rest_and_naive_clock() -> None:
    with pytest.raises(ValidationError):
        RestState(status="running")
    with pytest.raises(ValidationError):
        RestState(status="idle", remaining_seconds=10)
    with pytest.raises(ValueError):
        start_rest(90, datetime(2026, 11, 7))


def test_session_lifecycle_and_utc_timestamps() -> None:
    payload: dict[str, object] = {
        "id": ID,
        "ownerId": ID,
        "operationId": ID,
        "routineNameSnapshot": "Push day",
        "startedAt": NOW,
        "status": "active",
        "restState": {"status": "idle"},
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    assert validate_input(WorkoutSession, payload)[1] is None
    payload["status"] = "completed"
    assert validate_input(WorkoutSession, payload)[1] is not None
    payload["endedAt"] = NOW + timedelta(minutes=10)
    assert validate_input(WorkoutSession, payload)[1] is None
    payload["endedAt"] = NOW - timedelta(seconds=1)
    assert validate_input(WorkoutSession, payload)[1] is not None
    payload["endedAt"] = "2026-11-07T12:10:00+01:00"
    assert validate_input(WorkoutSession, payload)[1] is not None


def test_session_exercise_snapshot_validation() -> None:
    payload: dict[str, object] = {
        "id": ID,
        "sessionId": ID,
        "exerciseId": ID,
        "exerciseNameSnapshot": "Bench press",
        "loadConventionSnapshot": "total",
        "position": 0,
        "createdAt": NOW,
        "updatedAt": NOW,
        "targets": {"targetSets": 3, "targetReps": 10, "targetKg": 20, "restSeconds": 90},
    }
    exercise, error = validate_input(SessionExercise, payload)
    assert error is None and exercise is not None
    payload["exerciseNameSnapshot"] = "Renamed routine exercise"
    assert exercise.exercise_name_snapshot == "Bench press"
    payload["replacedEntryId"] = ID
    assert validate_input(SessionExercise, payload)[1] is not None
    payload["replacedEntryId"] = None
    payload["loadConventionSnapshot"] = "bodyweight"
    assert validate_input(SessionExercise, payload)[1] is not None

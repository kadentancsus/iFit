from __future__ import annotations

import re
from typing import Any, get_args
from uuid import uuid4

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.contracts import catalog, common, identity, planning, workout
from app.contracts.operations import OPERATIONS
from app.core.responses import ApiResponse
from app.features.planning import schemas as planning_lane
from app.features.workout import schemas as workout_lane

#: The operation names agent.md requires. saveRoutine is create + update.
REQUIRED = {
    "getDashboard", "getProfile", "updateProfile",
    "listExercises", "getExercise", "getAlternatives",
    "listRoutines", "getRoutine", "createRoutine", "updateRoutine", "deleteRoutine",
    "scheduleRoutine", "rescheduleWorkout", "cancelScheduledWorkout",
    "startWorkout", "getActiveWorkout", "getWorkout",
    "logSet", "updateSet", "deleteSet", "swapExercise",
    "saveRestState", "finishWorkout", "listHistory", "getProgress",
}  # fmt: skip


def test_every_required_operation_has_a_route() -> None:
    names = [op.name for op in OPERATIONS]
    assert len(names) == len(set(names))
    assert set(names) >= REQUIRED


def test_swap_confirmation_cannot_transfer_original_load() -> None:
    payload = {
        "sessionExerciseId": str(uuid4()), "replacementExerciseId": str(uuid4()),
        "operationId": str(uuid4()),
        "remainingTargets": {"targetSets": 2, "targetReps": 10, "restSeconds": 90},
    }
    assert workout.SwapExerciseInput.model_validate(payload).remaining_targets.target_sets == 2
    payload["remainingTargets"]["targetKg"] = 60  # type: ignore[index]
    with pytest.raises(ValidationError):
        workout.SwapExerciseInput.model_validate(payload)


def test_volume_is_not_limited_to_single_set_load() -> None:
    summary = workout.WorkoutSummary.model_validate({
        "id": str(uuid4()), "routineNameSnapshot": "Push day", "status": "completed",
        "startedAt": "2026-11-07T12:00:00Z", "endedAt": "2026-11-07T13:00:00Z",
        "durationSeconds": 3600, "exerciseCount": 3, "setCount": 9,
        "weightedVolumeKg": 5400,
    })
    assert summary.weighted_volume_kg == 5400


def test_routes_are_unique_and_well_formed() -> None:
    pairs = [(op.method, op.path) for op in OPERATIONS]
    assert len(pairs) == len(set(pairs))
    for op in OPERATIONS:
        assert re.fullmatch(r"/[a-z-]+(/(\{[a-z][A-Za-z]*\}|[a-z-]+))*", op.path), op.path


def test_lane_value_sets_match_the_shared_ones() -> None:
    assert get_args(planning_lane.LoadConvention) == get_args(common.LoadConvention)
    assert get_args(planning_lane.ScheduleStatus) == get_args(common.ScheduleStatus)
    assert get_args(workout_lane.LoadConvention) == get_args(common.LoadConvention)
    assert get_args(workout_lane.LoadMode) == get_args(common.LoadMode)
    assert get_args(workout_lane.SessionStatus) == get_args(common.SessionStatus)
    assert set(get_args(planning_lane.PlanningErrorCode)) <= set(common.ERROR_CODES)


class TestProfileUpdate:
    def test_reads_camel_case_and_trims_the_name(self) -> None:
        update = identity.ProfileUpdate.model_validate(
            {"displayName": "  Kaden  ", "displayUnit": "lb", "timezone": "America/Los_Angeles"}
        )
        assert update.display_name == "Kaden"
        assert update.model_dump(by_alias=True, exclude_unset=True) == {
            "displayName": "Kaden",
            "displayUnit": "lb",
            "timezone": "America/Los_Angeles",
        }

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"displayName": None},
            {"displayName": "   "},
            {"displayName": "x" * 51},
            {"displayUnit": "stone"},
            {"timezone": "Mars/Olympus"},
            {"userId": str(uuid4())},  # never trust a client-supplied user ID
        ],
    )
    def test_rejects(self, body: dict[str, Any]) -> None:
        with pytest.raises(ValidationError):
            identity.ProfileUpdate.model_validate(body)


@pytest.mark.parametrize("value", ["2026-02-30", "11/07/2026", 20261107])
def test_local_dates_are_strict(value: object) -> None:
    with pytest.raises(ValidationError):
        planning.ScheduleRange.model_validate({"fromDate": value, "toDate": "2026-11-07"})


@pytest.mark.parametrize("kg", [-1, 1000.5, float("inf"), float("nan")])
def test_kilograms_are_finite_and_in_range(kg: float) -> None:
    with pytest.raises(ValidationError):
        catalog.LastPerformance.model_validate(
            {
                "reps": 5,
                "weightKg": kg,
                "loadMode": "weighted",
                "completedAt": "2026-11-07T10:00:00Z",
            }
        )


def test_every_contract_renders_in_openapi() -> None:
    """Building the schema catches models FastAPI cannot document."""
    app = FastAPI()
    models = [
        identity.SessionInfo, identity.Profile, identity.Dashboard,
        catalog.Exercise, catalog.AlternativeOption,
        planning.Routine, planning.RoutineSummary, planning.ScheduledWorkout,
        workout.WorkoutDetail, workout.SwapResult, workout.WorkoutSummary,
        workout.ExerciseProgress,
    ]  # fmt: skip
    for index, model in enumerate(models):
        app.get(f"/r{index}", response_model=ApiResponse[model])(lambda: None)  # type: ignore[valid-type]
    bodies = [
        identity.ProfileUpdate, planning.RoutineInput, planning.ScheduleInput,
        planning.RescheduleInput, workout.StartWorkoutInput, workout.LogSetInput,
        workout.UpdateSetInput, workout.SwapExerciseInput, workout.RestState,
        workout.FinishWorkoutInput,
    ]  # fmt: skip
    for index, body in enumerate(bodies):

        def handler(payload: Any) -> None:
            return None

        # Set the real type directly; this module's annotations are strings.
        handler.__annotations__ = {"payload": body, "return": None}
        app.post(f"/b{index}")(handler)

    schemas = app.openapi()["components"]["schemas"]
    dashboard = schemas["Dashboard"]["properties"]
    assert {"todaysWorkouts", "activeWorkout", "recentSessions", "progress"} <= set(dashboard)
    assert "weightedVolumeKg" in schemas["WorkoutSummary"]["properties"]

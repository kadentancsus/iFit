"""Planning validation rules. Mirrors frontend/src/features/planning/planning.test.ts."""

from __future__ import annotations

import math
from typing import Any

import pytest

from app.features.planning import (
    SCHEDULE_STATUSES,
    ExerciseRef,
    PlanningResult,
    RoutineInput,
    can_change_schedule,
    is_local_date,
    is_uuid,
    validate_reschedule_input,
    validate_routine_input,
    validate_schedule_input,
)
from app.features.planning.schemas import (
    ROUTINE_MAX_EXERCISES,
    ROUTINE_MAX_KG,
    ROUTINE_MAX_REPS,
    ROUTINE_MAX_REST_SECONDS,
    ROUTINE_MAX_SETS,
    ROUTINE_TITLE_LENGTH,
)

ROUTINE_ID = "11111111-1111-4111-8111-111111111111"
OPERATION_ID = "22222222-2222-4222-8222-222222222222"
ROW_ID = "33333333-3333-4333-8333-333333333333"

# IDs and names match the seeded catalog (supabase/seed.sql).
BENCH = ExerciseRef(
    id="e1f17000-0000-4000-8000-000000000001",
    name="Barbell Bench Press",
    load_convention="total",
)
PUSH_UP = ExerciseRef(
    id="e1f17000-0000-4000-8000-000000000006",
    name="Push-Up",
    load_convention="bodyweight",
)
CATALOG = {exercise.id: exercise for exercise in (BENCH, PUSH_UP)}


def find_exercise(exercise_id: str) -> ExerciseRef | None:
    return CATALOG.get(exercise_id.lower())


def planned_exercise(**overrides: Any) -> dict[str, Any]:
    return {
        "exerciseId": BENCH.id,
        "targetSets": 3,
        "targetReps": 10,
        "targetKg": 60,
        "restSeconds": 90,
        **overrides,
    }


def routine(**overrides: Any) -> dict[str, Any]:
    return {"title": "Push day", "exercises": [planned_exercise()], **overrides}


def validate(payload: Any) -> PlanningResult[RoutineInput]:
    return validate_routine_input(payload, find_exercise)


class TestValidateRoutineInput:
    def test_accepts_a_valid_routine_and_trims_its_title(self) -> None:
        result = validate(routine(title="  Push day  "))
        assert result.error is None
        assert result.data is not None
        assert result.data.title == "Push day"
        assert [e.model_dump(by_alias=True, exclude_none=True) for e in result.data.exercises] == [
            planned_exercise()
        ]

    def test_allows_a_routine_with_no_exercises_yet(self) -> None:
        assert validate(routine(exercises=[])).error is None

    def test_keeps_the_submitted_exercise_order(self) -> None:
        result = validate(
            routine(
                exercises=[
                    planned_exercise(exerciseId=PUSH_UP.id, targetKg=None),
                    planned_exercise(),
                ]
            )
        )
        assert result.data is not None
        assert [e.exercise_id for e in result.data.exercises] == [PUSH_UP.id, BENCH.id]

    def test_allows_the_same_exercise_twice(self) -> None:
        assert validate(routine(exercises=[planned_exercise(), planned_exercise()])).error is None

    def test_treats_a_missing_target_load_as_no_planned_load(self) -> None:
        exercise = planned_exercise()
        del exercise["targetKg"]
        result = validate(routine(exercises=[exercise]))
        assert result.data is not None
        assert result.data.exercises[0].target_kg is None

    def test_accepts_a_zero_load_such_as_an_empty_bar(self) -> None:
        assert validate(routine(exercises=[planned_exercise(targetKg=0)])).error is None

    def test_accepts_a_fractional_load(self) -> None:
        result = validate(routine(exercises=[planned_exercise(targetKg=22.5)]))
        assert result.data is not None
        assert result.data.exercises[0].target_kg == 22.5

    def test_accepts_whole_numbers_sent_as_floats(self) -> None:
        result = validate(routine(exercises=[planned_exercise(targetSets=3.0)]))
        assert result.data is not None
        assert result.data.exercises[0].target_sets == 3
        assert isinstance(result.data.exercises[0].target_sets, int)

    def test_preserves_ids_when_editing(self) -> None:
        result = validate(
            routine(id=ROUTINE_ID, operationId=OPERATION_ID, exercises=[planned_exercise(id=ROW_ID)])
        )
        assert result.data is not None
        assert result.data.id == ROUTINE_ID
        assert result.data.operation_id == OPERATION_ID
        assert result.data.exercises[0].id == ROW_ID

    def test_ignores_unknown_fields_including_a_client_supplied_owner(self) -> None:
        result = validate(routine(ownerId=ROUTINE_ID, userId=ROUTINE_ID))
        assert result.data is not None
        dumped = result.data.model_dump(by_alias=True)
        assert "ownerId" not in dumped
        assert "userId" not in dumped

    @pytest.mark.parametrize("payload", [None, "routine", 7, [], True])
    def test_rejects_non_object_routines(self, payload: Any) -> None:
        result = validate(payload)
        assert result.error is not None
        assert result.error.code == "invalid_input"

    @pytest.mark.parametrize(
        "title", ["   ", None, 7, "x" * (ROUTINE_TITLE_LENGTH + 1)], ids=["blank", "missing", "non-text", "too-long"]
    )
    def test_rejects_bad_titles(self, title: Any) -> None:
        result = validate(routine(title=title))
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("invalid_title", "title")

    def test_accepts_a_title_at_the_length_limit(self) -> None:
        assert validate(routine(title="x" * ROUTINE_TITLE_LENGTH)).error is None

    def test_rejects_a_non_list_exercise_list(self) -> None:
        result = validate(routine(exercises="bench"))
        assert result.error is not None
        assert result.error.field == "exercises"

    def test_limits_the_number_of_exercises(self) -> None:
        exercises = [planned_exercise() for _ in range(ROUTINE_MAX_EXERCISES + 1)]
        result = validate(routine(exercises=exercises))
        assert result.error is not None
        assert result.error.code == "too_many_exercises"

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("targetSets", 0),
            ("targetSets", ROUTINE_MAX_SETS + 1),
            ("targetSets", 2.5),
            ("targetSets", "3"),
            ("targetSets", True),
            ("targetSets", None),
            ("targetReps", 0),
            ("targetReps", ROUTINE_MAX_REPS + 1),
            ("targetReps", math.nan),
            ("restSeconds", -1),
            ("restSeconds", ROUTINE_MAX_REST_SECONDS + 1),
            ("targetKg", -1),
            ("targetKg", ROUTINE_MAX_KG + 1),
            ("targetKg", math.inf),
            ("targetKg", math.nan),
            ("targetKg", "60"),
            ("targetKg", True),
        ],
    )
    def test_rejects_out_of_range_targets(self, field: str, value: Any) -> None:
        result = validate(routine(exercises=[planned_exercise(**{field: value})]))
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("invalid_target", f"exercises.0.{field}")

    def test_points_at_the_exercise_that_failed(self) -> None:
        result = validate(routine(exercises=[planned_exercise(), planned_exercise(targetReps=0)]))
        assert result.error is not None
        assert result.error.field == "exercises.1.targetReps"

    @pytest.mark.parametrize("exercise_id", ["bench", ROUTINE_ID, None], ids=["malformed", "unknown", "missing"])
    def test_rejects_bad_exercise_ids(self, exercise_id: Any) -> None:
        result = validate(routine(exercises=[planned_exercise(exerciseId=exercise_id)]))
        assert result.error is not None
        assert result.error.code == "unknown_exercise"

    def test_rejects_a_non_object_exercise(self) -> None:
        result = validate(routine(exercises=["bench"]))
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("invalid_input", "exercises.0")

    def test_rejects_a_target_load_on_a_bodyweight_exercise(self) -> None:
        result = validate(routine(exercises=[planned_exercise(exerciseId=PUSH_UP.id, targetKg=10)]))
        assert result.error is not None
        assert result.error.code == "load_not_applicable"
        assert "Push-Up" in result.error.message

    def test_accepts_a_bodyweight_exercise_with_no_target_load(self) -> None:
        result = validate(routine(exercises=[planned_exercise(exerciseId=PUSH_UP.id, targetKg=None)]))
        assert result.error is None

    def test_rejects_the_same_saved_row_twice_ignoring_case(self) -> None:
        result = validate(
            routine(
                exercises=[
                    planned_exercise(id="ABCDEF00-0000-4000-8000-000000000000"),
                    planned_exercise(id="abcdef00-0000-4000-8000-000000000000"),
                ]
            )
        )
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("duplicate_entry", "exercises.1.id")

    @pytest.mark.parametrize("field", ["id", "operationId"])
    def test_rejects_malformed_ids(self, field: str) -> None:
        result = validate(routine(**{field: "nope"}))
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("invalid_id", field)

    def test_serializes_as_the_shared_data_error_shape(self) -> None:
        body = validate(routine()).model_dump(by_alias=True)
        assert set(body) == {"data", "error"}
        assert body["error"] is None
        assert body["data"]["exercises"][0]["exerciseId"] == BENCH.id


class TestIsLocalDate:
    @pytest.mark.parametrize("value", ["2026-11-06", "2028-02-29", "2026-12-31"])
    def test_accepts_real_dates(self, value: str) -> None:
        assert is_local_date(value)

    @pytest.mark.parametrize(
        "value",
        [
            "2026-02-29",
            "2026-02-30",
            "2026-13-01",
            "2026-00-10",
            "2026-11-31",
            "11/06/2026",
            "2026-1-6",
            "2026-11-06T00:00:00Z",
            "2026-11-06\n",
            "２０２６-11-06",  # noqa: RUF001  (full-width digits must be rejected)
            "",
            None,
            20261106,
        ],
    )
    def test_rejects_invalid_dates(self, value: Any) -> None:
        assert not is_local_date(value)


class TestIsUuid:
    def test_accepts_upper_and_lower_case(self) -> None:
        assert is_uuid(ROUTINE_ID)
        assert is_uuid(ROUTINE_ID.upper())

    @pytest.mark.parametrize("value", ["", "nope", f"{ROUTINE_ID}0", f"{ROUTINE_ID}\n", None, 1])
    def test_rejects_non_uuids(self, value: Any) -> None:
        assert not is_uuid(value)


class TestValidateScheduleInput:
    @staticmethod
    def schedule(**overrides: Any) -> dict[str, Any]:
        return {"routineId": ROUTINE_ID, "localDate": "2026-11-10", **overrides}

    def test_accepts_a_valid_schedule(self) -> None:
        result = validate_schedule_input(self.schedule(operationId=OPERATION_ID))
        assert result.model_dump(by_alias=True, exclude_none=True) == {
            "data": self.schedule(operationId=OPERATION_ID)
        }

    def test_accepts_today(self) -> None:
        assert validate_schedule_input(self.schedule(), today="2026-11-10").error is None

    def test_rejects_a_past_date_when_today_is_known(self) -> None:
        result = validate_schedule_input(self.schedule(), today="2026-11-11")
        assert result.error is not None
        assert (result.error.code, result.error.field) == ("date_in_past", "localDate")

    def test_rejects_an_impossible_date(self) -> None:
        result = validate_schedule_input(self.schedule(localDate="2026-02-30"))
        assert result.error is not None
        assert result.error.code == "invalid_date"

    def test_rejects_a_malformed_routine_id(self) -> None:
        result = validate_schedule_input(self.schedule(routineId="nope"))
        assert result.error is not None
        assert result.error.code == "invalid_id"

    def test_rejects_a_malformed_operation_id(self) -> None:
        result = validate_schedule_input(self.schedule(operationId="nope"))
        assert result.error is not None
        assert result.error.field == "operationId"

    def test_rejects_input_that_is_not_an_object(self) -> None:
        result = validate_schedule_input(None)
        assert result.error is not None
        assert result.error.code == "invalid_input"


class TestValidateRescheduleInput:
    def test_accepts_a_new_date(self) -> None:
        payload = {"id": ROW_ID, "localDate": "2026-11-12"}
        result = validate_reschedule_input(payload, today="2026-11-06")
        assert result.model_dump(by_alias=True, exclude_none=True) == {"data": payload}

    def test_lets_a_past_plan_move_forward_without_complaint(self) -> None:
        result = validate_reschedule_input({"id": ROW_ID, "localDate": "2026-11-06"}, today="2026-11-06")
        assert result.error is None

    def test_rejects_moving_to_a_past_date(self) -> None:
        result = validate_reschedule_input({"id": ROW_ID, "localDate": "2026-11-01"}, today="2026-11-06")
        assert result.error is not None
        assert result.error.code == "date_in_past"

    def test_rejects_a_malformed_id(self) -> None:
        result = validate_reschedule_input({"id": "x", "localDate": "2026-11-12"})
        assert result.error is not None
        assert result.error.code == "invalid_id"

    def test_rejects_input_that_is_not_an_object(self) -> None:
        result = validate_reschedule_input("x")
        assert result.error is not None
        assert result.error.code == "invalid_input"


class TestCanChangeSchedule:
    def test_only_allows_changes_to_planned_workouts(self) -> None:
        assert [status for status in SCHEDULE_STATUSES if can_change_schedule(status)] == ["planned"]

    def test_has_no_status_that_judges_a_missed_session(self) -> None:
        assert "missed" not in SCHEDULE_STATUSES

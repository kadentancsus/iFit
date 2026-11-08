"""Alternatives through the real catalog, including prior loads from real workouts."""

from __future__ import annotations

import uuid

import httpx
import pytest

pytestmark = pytest.mark.anyio

Headers = dict[str, str]
BENCH = "e1f17000-0000-4000-8000-000000000001"


async def alternatives(
    api: httpx.AsyncClient, exercise: str, *, headers: Headers | None = None, **params: str
) -> httpx.Response:
    return await api.get(
        f"/api/v1/exercises/{exercise}/alternatives", params=params, headers=headers or {}
    )


async def by_slug(api: httpx.AsyncClient, slug: str) -> dict[str, object]:
    data: dict[str, object] = (await api.get(f"/api/v1/exercises/{slug}")).json()["data"]
    return data


async def log_sets(
    api: httpx.AsyncClient, user: Headers, sets: list[tuple[str, int, float | None]]
) -> None:
    """Logs one set per (exercise ID, reps, kg) in a real workout via the workout API.

    Uses a single workout, since a user can have only one active session.
    """
    routine = await api.post(
        "/api/v1/routines",
        json={
            "title": "History",
            "exercises": [
                {"exerciseId": exercise_id, "targetSets": 1, "targetReps": reps, "targetKg": None, "restSeconds": 60}
                for exercise_id, reps, _ in sets
            ],
        },
        headers=user,
    )
    assert routine.status_code == 201, routine.text
    started = await api.post(
        "/api/v1/workouts",
        json={"routineId": routine.json()["data"]["id"], "operationId": str(uuid.uuid4())},
        headers=user,
    )
    assert started.status_code == 200, started.text
    entries = [item["entry"] for item in started.json()["data"]["exercises"]]
    for entry, (_, reps, weight_kg) in zip(entries, sets, strict=True):
        logged = await api.post(
            "/api/v1/sets",
            json={
                "sessionExerciseId": entry["id"],
                "reps": reps,
                "weightKg": weight_kg,
                "loadMode": "bodyweight" if weight_kg is None else "weighted",
                "operationId": str(uuid.uuid4()),
            },
            headers=user,
        )
        assert logged.status_code == 200, logged.text


async def test_substitutions_are_public_and_in_curated_order(api: httpx.AsyncClient) -> None:
    response = await alternatives(api, "barbell-bench-press", kind="substitution")

    assert response.status_code == 200
    options = response.json()["data"]
    assert [option["exercise"]["slug"] for option in options] == [
        "dumbbell-flat-bench-press",
        "chest-press-machine",
        "push-up",
    ]
    assert all(option["rationale"] and option["lastPerformance"] is None for option in options)


async def test_regressions_and_ids_work_too(api: httpx.AsyncClient) -> None:
    response = await alternatives(api, BENCH, kind="regression")
    assert [option["kind"] for option in response.json()["data"]] == ["regression", "regression"]


async def test_filters_by_equipment(api: httpx.AsyncClient) -> None:
    response = await alternatives(
        api, "barbell-bench-press", kind="substitution", equipment="bodyweight"
    )
    assert [option["exercise"]["name"] for option in response.json()["data"]] == ["Push-Up"]


async def test_no_match_is_an_empty_list(api: httpx.AsyncClient) -> None:
    response = await alternatives(api, "barbell-bench-press", kind="substitution", equipment="cable")
    assert response.status_code == 200
    assert response.json()["data"] == []


@pytest.mark.parametrize(
    ("exercise", "params", "status"),
    [
        ("no-such-exercise", {"kind": "substitution"}, 404),
        ("barbell-bench-press", {}, 422),
        ("barbell-bench-press", {"kind": "harder"}, 422),
        ("barbell-bench-press", {"kind": "substitution", "equipment": "kettlebell"}, 422),
    ],
)
async def test_rejects_bad_requests(
    api: httpx.AsyncClient, exercise: str, params: dict[str, str], status: int
) -> None:
    response = await api.get(f"/api/v1/exercises/{exercise}/alternatives", params=params)
    assert response.status_code == status


async def test_an_invalid_token_is_rejected_not_ignored(api: httpx.AsyncClient) -> None:
    response = await alternatives(
        api, "barbell-bench-press", headers={"Authorization": "Bearer nope"}, kind="substitution"
    )
    assert response.status_code == 401


async def test_prefills_only_from_the_users_own_history_of_that_exercise(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> None:
    dumbbell = await by_slug(api, "dumbbell-flat-bench-press")
    push_up = await by_slug(api, "push-up")
    await log_sets(
        api,
        alex,
        [
            # Heavy barbell history must not leak into any suggestion's load.
            (BENCH, 5, 80),
            (str(dumbbell["id"]), 10, 22.5),
            (str(push_up["id"]), 12, None),
        ],
    )

    mine = {
        option["exercise"]["slug"]: option["lastPerformance"]
        for option in (await alternatives(api, BENCH, headers=alex, kind="substitution")).json()["data"]
    }
    assert mine["dumbbell-flat-bench-press"]["weightKg"] == 22.5
    assert mine["dumbbell-flat-bench-press"]["reps"] == 10
    assert mine["push-up"]["loadMode"] == "bodyweight"
    assert mine["chest-press-machine"] is None

    theirs = (await alternatives(api, BENCH, headers=bailey, kind="substitution")).json()["data"]
    assert all(option["lastPerformance"] is None for option in theirs)

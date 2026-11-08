"""The public catalog, read from the seeded database without signing in."""

from __future__ import annotations

import httpx
import pytest

pytestmark = pytest.mark.anyio


async def test_lists_the_seeded_catalog_without_sign_in(api: httpx.AsyncClient) -> None:
    response = await api.get("/api/v1/exercises")

    assert response.status_code == 200
    exercises = response.json()["data"]
    assert len(exercises) == 30
    assert [item["pattern"] for item in exercises][:1] == ["push"]
    assert {"instructions", "cues"}.isdisjoint(exercises[0])


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"search": "PUSH-up"}, {"Push-Up", "Incline Push-Up"}),
        ({"equipment": "cable", "pattern": "core"}, {"Pallof Press"}),
        ({"search": "%"}, set()),
    ],
)
async def test_filters(api: httpx.AsyncClient, params: dict[str, str], expected: set[str]) -> None:
    response = await api.get("/api/v1/exercises", params=params)
    assert {item["name"] for item in response.json()["data"]} == expected


async def test_muscle_filter_includes_secondary_muscles(api: httpx.AsyncClient) -> None:
    names = {
        item["name"]
        for item in (await api.get("/api/v1/exercises", params={"muscle": "triceps"})).json()["data"]
    }
    assert "Barbell Bench Press" in names


async def test_rejects_an_unknown_filter_value(api: httpx.AsyncClient) -> None:
    response = await api.get("/api/v1/exercises", params={"equipment": "kettlebell"})
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_input",
        "message": "Some of the information sent was missing or invalid.",
        "field": "equipment",
    }


async def test_reads_one_exercise_by_slug_or_id(api: httpx.AsyncClient) -> None:
    by_slug = (await api.get("/api/v1/exercises/goblet-squat")).json()["data"]
    by_id = (await api.get(f"/api/v1/exercises/{by_slug['id']}")).json()["data"]

    assert by_slug == by_id
    assert len(by_slug["cues"]) == 3
    assert len(by_slug["instructions"]) >= 3
    assert by_slug["motionAssetPath"] == "/exercises/goblet-squat-motion.svg"


@pytest.mark.parametrize(
    "missing", ["no-such-exercise", "e1f17000-0000-4000-8000-999999999999", "Bad Slug!", "x" * 81]
)
async def test_unknown_exercises_are_not_found(api: httpx.AsyncClient, missing: str) -> None:
    response = await api.get(f"/api/v1/exercises/{missing}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "exercise_not_found"

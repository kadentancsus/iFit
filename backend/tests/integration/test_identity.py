"""Profile and dashboard through FastAPI, PostgREST and Postgres with RLS on."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import httpx
import pytest

from tests.integration.conftest import ALEX_ID, BAILEY_ID

Headers = dict[str, str]
BENCH = "e1f17000-0000-4000-8000-000000000001"


@pytest.fixture
async def fresh_profiles(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> AsyncIterator[None]:
    """Profiles outlive the per-test reset, so put both back to sign-up defaults."""
    for user, name in ((alex, "alex"), (bailey, "bailey")):
        response = await api.patch(
            "/api/v1/profile",
            json={"displayName": name, "displayUnit": "kg", "timezone": "UTC"},
            headers=user,
        )
        assert response.status_code == 200, response.text
    yield


pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("fresh_profiles")]


async def test_sign_up_created_a_private_profile_for_each_account(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> None:
    alex_profile = (await api.get("/api/v1/profile", headers=alex)).json()["data"]
    bailey_profile = (await api.get("/api/v1/profile", headers=bailey)).json()["data"]
    assert alex_profile["userId"] == ALEX_ID
    assert alex_profile["displayName"] == "alex"
    assert bailey_profile["userId"] == BAILEY_ID


async def test_settings_persist_and_never_touch_another_account(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> None:
    response = await api.patch(
        "/api/v1/profile",
        json={"displayName": "  Alex R ", "displayUnit": "lb", "timezone": "Asia/Tokyo"},
        headers=alex,
    )
    assert response.status_code == 200, response.text

    reread = (await api.get("/api/v1/profile", headers=alex)).json()["data"]
    assert (reread["displayName"], reread["displayUnit"], reread["timezone"]) == (
        "Alex R",
        "lb",
        "Asia/Tokyo",
    )
    bailey_profile = (await api.get("/api/v1/profile", headers=bailey)).json()["data"]
    assert (bailey_profile["displayName"], bailey_profile["displayUnit"]) == ("bailey", "kg")


async def test_a_client_supplied_user_id_is_refused(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> None:
    response = await api.patch(
        "/api/v1/profile", json={"userId": ALEX_ID, "displayName": "Hijacked"}, headers=bailey
    )
    assert response.status_code == 422
    alex_profile = (await api.get("/api/v1/profile", headers=alex)).json()["data"]
    assert alex_profile["displayName"] == "alex"


async def test_dashboard_reflects_only_the_callers_records(
    api: httpx.AsyncClient, alex: Headers, bailey: Headers
) -> None:
    routine = await api.post(
        "/api/v1/routines",
        json={
            "title": "Push day",
            "exercises": [
                {
                    "exerciseId": BENCH,
                    "targetSets": 3,
                    "targetReps": 8,
                    "targetKg": 60,
                    "restSeconds": 90,
                }
            ],
        },
        headers=alex,
    )
    assert routine.status_code == 201, routine.text
    started = await api.post(
        "/api/v1/workouts",
        json={"routineId": routine.json()["data"]["id"], "operationId": str(uuid.uuid4())},
        headers=alex,
    )
    assert started.status_code == 200, started.text

    alex_dashboard = (await api.get("/api/v1/dashboard", headers=alex)).json()
    assert alex_dashboard["error"] is None
    assert alex_dashboard["data"]["activeWorkout"]["routineNameSnapshot"] == "Push day"

    bailey_dashboard = (await api.get("/api/v1/dashboard", headers=bailey)).json()
    assert bailey_dashboard["error"] is None
    data = bailey_dashboard["data"]
    assert data["activeWorkout"] is None
    assert data["recentSessions"] == []
    assert data["todaysWorkouts"] == []
    assert data["progress"] == {"sessionsLast7Days": 0, "sessionsLast30Days": 0, "setsLast7Days": 0}

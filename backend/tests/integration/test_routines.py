"""Routine journeys through FastAPI, PostgREST and Postgres with RLS turned on."""

from __future__ import annotations

import asyncio
import uuid

import httpx
import pytest

from tests.integration.conftest import ALEX_ID, BAILEY_ID, headers_for

pytestmark = pytest.mark.anyio

BENCH = "e1f17000-0000-4000-8000-000000000001"
INCLINE = "e1f17000-0000-4000-8000-000000000002"
FLAT_DUMBBELL = "e1f17000-0000-4000-8000-000000000003"

Headers = dict[str, str]


def planned(exercise_id: str, **overrides: object) -> dict[str, object]:
    return {
        "exerciseId": exercise_id,
        "targetSets": 3,
        "targetReps": 10,
        "targetKg": None,
        "restSeconds": 90,
        **overrides,
    }


async def create(
    api: httpx.AsyncClient, user: Headers, title: str = "Push day", *exercise_ids: str
) -> dict[str, object]:
    response = await api.post(
        "/api/v1/routines",
        json={"title": title, "exercises": [planned(item) for item in exercise_ids]},
        headers=user,
    )
    assert response.status_code == 201, response.text
    data: dict[str, object] = response.json()["data"]
    return data


class TestPersistence:
    async def test_saved_targets_can_be_read_back(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        created = await api.post(
            "/api/v1/routines",
            json={
                "title": "  Push day  ",
                "exercises": [planned(BENCH, targetSets=4, targetReps=8, targetKg=42.5, restSeconds=120)],
            },
            headers=alex,
        )
        assert created.status_code == 201

        routine = created.json()["data"]
        fetched = await api.get(f"/api/v1/routines/{routine['id']}", headers=alex)

        assert fetched.json()["data"] == routine
        assert routine["title"] == "Push day"
        exercise = routine["exercises"][0]
        assert exercise["exerciseName"] == "Barbell Bench Press"
        assert exercise["equipment"] == "barbell"
        assert exercise["loadConvention"] == "total"
        assert (
            exercise["position"],
            exercise["targetSets"],
            exercise["targetReps"],
            exercise["targetKg"],
            exercise["restSeconds"],
        ) == (0, 4, 8, 42.5, 120)

    async def test_lists_most_recently_changed_first_with_counts(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        older = await create(api, alex, "Older", BENCH, INCLINE)
        await create(api, alex, "Newer")
        await api.put(
            f"/api/v1/routines/{older['id']}",
            json={"title": "Older, edited", "exercises": [planned(BENCH)]},
            headers=alex,
        )

        routines = (await api.get("/api/v1/routines", headers=alex)).json()["data"]

        assert [(item["title"], item["exerciseCount"]) for item in routines] == [
            ("Older, edited", 1),
            ("Newer", 0),
        ]

    async def test_reordering_keeps_row_ids_and_targets(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine = await create(api, alex, "Push day", BENCH, INCLINE, FLAT_DUMBBELL)
        first, second, third = routine["exercises"]  # type: ignore[misc]

        def resend(row: dict[str, object], **overrides: object) -> dict[str, object]:
            return {**planned(str(row["exerciseId"])), "id": row["id"], **overrides}

        response = await api.put(
            f"/api/v1/routines/{routine['id']}",
            json={
                "title": "Push day",
                "exercises": [resend(third, targetReps=6), resend(first), resend(second)],
            },
            headers=alex,
        )

        assert response.status_code == 200, response.text
        saved = response.json()["data"]["exercises"]
        assert [row["id"] for row in saved] == [third["id"], first["id"], second["id"]]
        assert [row["position"] for row in saved] == [0, 1, 2]
        assert saved[0]["targetReps"] == 6

    async def test_exercises_can_be_added_and_removed(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine = await create(api, alex, "Push day", BENCH, INCLINE)
        kept = routine["exercises"][0]  # type: ignore[index]

        response = await api.put(
            f"/api/v1/routines/{routine['id']}",
            json={
                "title": "Push day",
                "exercises": [
                    {**planned(BENCH), "id": kept["id"]},
                    planned(FLAT_DUMBBELL),
                ],
            },
            headers=alex,
        )

        saved = response.json()["data"]["exercises"]
        assert [row["exerciseId"] for row in saved] == [BENCH, FLAT_DUMBBELL]
        assert saved[0]["id"] == kept["id"]

    async def test_a_routine_can_repeat_an_exercise(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine = await create(api, alex, "Push day", BENCH, BENCH)
        assert len(routine["exercises"]) == 2  # type: ignore[arg-type]

    async def test_a_retried_create_makes_one_routine(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        body = {"title": "Push day", "exercises": [planned(BENCH)], "operationId": str(uuid.uuid4())}

        first, second = await asyncio.gather(
            api.post("/api/v1/routines", json=body, headers=alex),
            api.post("/api/v1/routines", json=body, headers=alex),
        )

        assert first.status_code == second.status_code == 201, (first.text, second.text)
        assert first.json()["data"]["id"] == second.json()["data"]["id"]
        assert len((await api.get("/api/v1/routines", headers=alex)).json()["data"]) == 1

    async def test_concurrent_saves_never_mix_rows(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine = await create(api, alex, "Push day", BENCH)
        bodies = [
            {"title": f"Version {number}", "exercises": [planned(BENCH), planned(INCLINE)]}
            for number in range(6)
        ]

        responses = await asyncio.gather(
            *(
                api.put(f"/api/v1/routines/{routine['id']}", json=body, headers=alex)
                for body in bodies
            )
        )

        assert {response.status_code for response in responses} == {200}
        saved = (await api.get(f"/api/v1/routines/{routine['id']}", headers=alex)).json()["data"]
        assert [row["position"] for row in saved["exercises"]] == [0, 1]

    async def test_deleting_removes_the_routine(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine = await create(api, alex, "Push day", BENCH)

        deleted = await api.delete(f"/api/v1/routines/{routine['id']}", headers=alex)
        again = await api.delete(f"/api/v1/routines/{routine['id']}", headers=alex)
        fetched = await api.get(f"/api/v1/routines/{routine['id']}", headers=alex)

        assert deleted.status_code == 200
        assert deleted.json()["data"] == {"id": routine["id"]}
        assert again.status_code == 404
        assert fetched.status_code == 404


class TestTwoUserIsolation:
    async def test_routines_are_not_listed_for_other_users(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        await create(api, alex, "Alex only", BENCH)
        assert (await api.get("/api/v1/routines", headers=bailey)).json()["data"] == []

    async def test_another_users_routine_reads_as_missing(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        routine = await create(api, alex, "Alex only", BENCH)
        path = f"/api/v1/routines/{routine['id']}"

        read = await api.get(path, headers=bailey)
        update = await api.put(path, json={"title": "Taken", "exercises": []}, headers=bailey)
        delete = await api.delete(path, headers=bailey)

        assert [read.status_code, update.status_code, delete.status_code] == [404, 404, 404]
        assert (await api.get(path, headers=alex)).json()["data"] == routine

    async def test_another_users_row_cannot_be_taken_over(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        victim = await create(api, alex, "Alex only", BENCH)
        victim_row = victim["exercises"][0]  # type: ignore[index]
        attacker = await create(api, bailey, "Bailey")

        response = await api.put(
            f"/api/v1/routines/{attacker['id']}",
            json={
                "title": "Bailey",
                "exercises": [{**planned(INCLINE, targetSets=1), "id": victim_row["id"]}],
            },
            headers=bailey,
        )

        assert response.status_code == 200, response.text
        assert response.json()["data"]["exercises"][0]["id"] != victim_row["id"]
        path = f"/api/v1/routines/{victim['id']}"
        assert (await api.get(path, headers=alex)).json()["data"] == victim

    async def test_an_owner_cannot_be_supplied_in_the_body(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        response = await api.post(
            "/api/v1/routines",
            json={"title": "Planted", "exercises": [], "ownerId": BAILEY_ID, "owner_id": BAILEY_ID},
            headers=alex,
        )

        assert response.status_code == 201
        assert (await api.get("/api/v1/routines", headers=bailey)).json()["data"] == []
        titles = [item["title"] for item in (await api.get("/api/v1/routines", headers=alex)).json()["data"]]
        assert titles == ["Planted"]

    async def test_operation_ids_are_scoped_to_each_user(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        body = {"title": "Same", "exercises": [], "operationId": str(uuid.uuid4())}

        mine = await api.post("/api/v1/routines", json=body, headers=alex)
        theirs = await api.post("/api/v1/routines", json=body, headers=bailey)

        assert mine.json()["data"]["id"] != theirs.json()["data"]["id"]

    async def test_concurrent_requests_keep_identities_separate(
        self, api: httpx.AsyncClient
    ) -> None:
        users = [ALEX_ID, BAILEY_ID] * 10
        created = await asyncio.gather(
            *(
                api.post(
                    "/api/v1/routines",
                    json={"title": f"Owner {user}", "exercises": []},
                    headers=headers_for(user),
                )
                for user in users
            )
        )
        assert {response.status_code for response in created} == {201}

        listed = await asyncio.gather(
            *(api.get("/api/v1/routines", headers=headers_for(user)) for user in users)
        )

        for user, response in zip(users, listed, strict=True):
            routines = response.json()["data"]
            assert len(routines) == 10
            assert {routine["title"] for routine in routines} == {f"Owner {user}"}

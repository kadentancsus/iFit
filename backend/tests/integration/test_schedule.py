"""Scheduling through FastAPI, PostgREST and Postgres with RLS turned on."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, timedelta

import httpx
import pytest

from tests.integration.conftest import ALEX_ID, BAILEY_ID, headers_for

pytestmark = pytest.mark.anyio

Headers = dict[str, str]
BENCH = "e1f17000-0000-4000-8000-000000000001"


def days_ahead(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


async def new_routine(api: httpx.AsyncClient, user: Headers, title: str = "Push day") -> str:
    response = await api.post(
        "/api/v1/routines",
        json={
            "title": title,
            "exercises": [
                {"exerciseId": BENCH, "targetSets": 3, "targetReps": 10, "targetKg": None, "restSeconds": 90}
            ],
        },
        headers=user,
    )
    assert response.status_code == 201, response.text
    routine_id: str = response.json()["data"]["id"]
    return routine_id


async def plan(
    api: httpx.AsyncClient, user: Headers, routine_id: str, local_date: str, **extra: object
) -> httpx.Response:
    return await api.post(
        "/api/v1/schedule",
        json={"routineId": routine_id, "localDate": local_date, **extra},
        headers=user,
    )


class TestScheduling:
    async def test_plans_a_routine_and_lists_it_by_date(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        later = await plan(api, alex, routine_id, days_ahead(5))
        sooner = await plan(api, alex, routine_id, days_ahead(1))

        assert later.status_code == sooner.status_code == 201
        assert sooner.json()["data"] == {
            "id": sooner.json()["data"]["id"],
            "routineId": routine_id,
            "routineTitle": "Push day",
            "localDate": days_ahead(1),
            "status": "planned",
        }
        listed = (await api.get("/api/v1/schedule", headers=alex)).json()["data"]
        assert [item["localDate"] for item in listed] == [days_ahead(1), days_ahead(5)]

    async def test_lists_only_the_requested_dates(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        for days in (1, 3, 9):
            await plan(api, alex, routine_id, days_ahead(days))

        response = await api.get(
            "/api/v1/schedule",
            params={"from": days_ahead(2), "to": days_ahead(9)},
            headers=alex,
        )

        assert [item["localDate"] for item in response.json()["data"]] == [
            days_ahead(3),
            days_ahead(9),
        ]

    async def test_today_is_allowed(self, api: httpx.AsyncClient, alex: Headers) -> None:
        routine_id = await new_routine(api, alex)
        assert (await plan(api, alex, routine_id, date.today().isoformat())).status_code == 201

    async def test_dates_past_everywhere_are_rejected(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        response = await plan(api, alex, routine_id, days_ahead(-2))

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "date_in_past"

    async def test_the_same_routine_twice_on_one_day_is_rejected(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        await plan(api, alex, routine_id, days_ahead(2))
        again = await plan(api, alex, routine_id, days_ahead(2))

        assert again.status_code == 409
        assert again.json()["error"]["code"] == "duplicate_entry"

    async def test_a_retried_request_makes_one_plan(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        operation_id = str(uuid.uuid4())

        first, second = await asyncio.gather(
            plan(api, alex, routine_id, days_ahead(2), operationId=operation_id),
            plan(api, alex, routine_id, days_ahead(2), operationId=operation_id),
        )

        assert first.status_code == second.status_code == 201, (first.text, second.text)
        assert first.json()["data"]["id"] == second.json()["data"]["id"]

    async def test_reschedules_and_cancels(self, api: httpx.AsyncClient, alex: Headers) -> None:
        routine_id = await new_routine(api, alex)
        planned = (await plan(api, alex, routine_id, days_ahead(1))).json()["data"]
        path = f"/api/v1/schedule/{planned['id']}"

        moved = await api.patch(path, json={"localDate": days_ahead(4)}, headers=alex)
        canceled = await api.post(f"{path}/cancel", headers=alex)
        again = await api.post(f"{path}/cancel", headers=alex)
        move_canceled = await api.patch(path, json={"localDate": days_ahead(6)}, headers=alex)

        assert moved.json()["data"]["localDate"] == days_ahead(4)
        assert canceled.json()["data"]["status"] == "canceled"
        assert again.status_code == 200
        assert move_canceled.status_code == 409
        assert move_canceled.json()["error"]["code"] == "schedule_locked"

    async def test_moving_onto_a_day_with_the_same_routine_is_rejected(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        await plan(api, alex, routine_id, days_ahead(1))
        second = (await plan(api, alex, routine_id, days_ahead(2))).json()["data"]

        response = await api.patch(
            f"/api/v1/schedule/{second['id']}", json={"localDate": days_ahead(1)}, headers=alex
        )

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "duplicate_entry"

    async def test_a_canceled_day_can_be_planned_again(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        first = (await plan(api, alex, routine_id, days_ahead(1))).json()["data"]
        await api.post(f"/api/v1/schedule/{first['id']}/cancel", headers=alex)

        assert (await plan(api, alex, routine_id, days_ahead(1))).status_code == 201

    async def test_renaming_a_routine_updates_its_plans(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        await plan(api, alex, routine_id, days_ahead(1))
        await api.put(
            f"/api/v1/routines/{routine_id}",
            json={"title": "Chest day", "exercises": []},
            headers=alex,
        )

        listed = (await api.get("/api/v1/schedule", headers=alex)).json()["data"]
        assert listed[0]["routineTitle"] == "Chest day"

    async def test_deleting_a_routine_cancels_its_plans_but_keeps_them(
        self, api: httpx.AsyncClient, alex: Headers
    ) -> None:
        routine_id = await new_routine(api, alex, "Leg day")
        await plan(api, alex, routine_id, days_ahead(1))

        await api.delete(f"/api/v1/routines/{routine_id}", headers=alex)

        listed = (await api.get("/api/v1/schedule", headers=alex)).json()["data"]
        assert [(item["routineId"], item["routineTitle"], item["status"]) for item in listed] == [
            (None, "Leg day", "canceled")
        ]


class TestTwoUserIsolation:
    async def test_plans_are_private(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)
        planned = (await plan(api, alex, routine_id, days_ahead(1))).json()["data"]
        path = f"/api/v1/schedule/{planned['id']}"

        listed = await api.get("/api/v1/schedule", headers=bailey)
        moved = await api.patch(path, json={"localDate": days_ahead(3)}, headers=bailey)
        canceled = await api.post(f"{path}/cancel", headers=bailey)

        assert listed.json()["data"] == []
        assert [moved.status_code, canceled.status_code] == [404, 404]
        mine = (await api.get("/api/v1/schedule", headers=alex)).json()["data"]
        assert mine == [planned]

    async def test_another_users_routine_cannot_be_scheduled(
        self, api: httpx.AsyncClient, alex: Headers, bailey: Headers
    ) -> None:
        routine_id = await new_routine(api, alex)

        response = await plan(api, bailey, routine_id, days_ahead(1))

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "routine_not_found"
        assert (await api.get("/api/v1/schedule", headers=alex)).json()["data"] == []

    async def test_concurrent_requests_keep_identities_separate(
        self, api: httpx.AsyncClient
    ) -> None:
        routines = {
            user: await new_routine(api, headers_for(user), f"Owner {user}")
            for user in (ALEX_ID, BAILEY_ID)
        }
        users = [ALEX_ID, BAILEY_ID] * 5
        responses = await asyncio.gather(
            *(
                plan(api, headers_for(user), routines[user], days_ahead(index + 1))
                for index, user in enumerate(users)
            )
        )
        assert {response.status_code for response in responses} == {201}

        for user in (ALEX_ID, BAILEY_ID):
            listed = (await api.get("/api/v1/schedule", headers=headers_for(user))).json()["data"]
            assert len(listed) == 5
            assert {item["routineTitle"] for item in listed} == {f"Owner {user}"}

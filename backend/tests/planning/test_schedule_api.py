"""Scheduling rules and endpoints without a database.

Persistence, conflicts and ownership are proven against real Postgres in
``tests/integration/test_schedule.py``.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import httpx
import pytest

from app.features.planning.schedule import MAX_DAYS_AHEAD, earliest_today
from tests.conftest import bearer, make_token
from tests.planning.conftest import ROUTINE_ID, FakePostgrest

ALEX = bearer(make_token("alex"))
SCHEDULE_ID = "33333333-0000-4000-8000-000000000001"


class TestEarliestToday:
    @pytest.mark.parametrize(
        ("now", "expected"),
        [
            # 11pm in Los Angeles on Nov 7 is already Nov 8 in UTC.
            (datetime(2026, 11, 8, 7, 0, tzinfo=UTC), date(2026, 11, 7)),
            (datetime(2026, 11, 8, 11, 59, tzinfo=UTC), date(2026, 11, 7)),
            (datetime(2026, 11, 8, 12, 0, tzinfo=UTC), date(2026, 11, 8)),
            (datetime(2027, 1, 1, 3, 0, tzinfo=UTC), date(2026, 12, 31)),
        ],
    )
    def test_never_runs_ahead_of_any_time_zone(self, now: datetime, expected: date) -> None:
        assert earliest_today(now) == expected


def touched_schedule(postgrest: FakePostgrest) -> bool:
    return any("scheduled_workouts" in request.url.path for request in postgrest.requests)



@pytest.mark.anyio
class TestEndpoints:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("GET", "/api/v1/schedule"),
            ("POST", "/api/v1/schedule"),
            ("PATCH", f"/api/v1/schedule/{SCHEDULE_ID}"),
            ("POST", f"/api/v1/schedule/{SCHEDULE_ID}/cancel"),
        ],
    )
    async def test_sign_in_is_required(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str, path: str
    ) -> None:
        response = await api.request(method, path, json={})
        assert response.status_code == 401
        assert postgrest.requests == []

    @pytest.mark.parametrize(
        ("body", "code", "field"),
        [
            ({"localDate": "2099-01-01"}, "invalid_id", "routineId"),
            ({"routineId": ROUTINE_ID, "localDate": "2026-02-30"}, "invalid_date", "localDate"),
            ({"routineId": ROUTINE_ID, "localDate": "tomorrow"}, "invalid_date", "localDate"),
            ({"routineId": ROUTINE_ID, "localDate": "2000-01-01"}, "date_in_past", "localDate"),
            ({"routineId": ROUTINE_ID, "localDate": "9999-12-31"}, "invalid_date", "localDate"),
            (
                {"routineId": ROUTINE_ID, "localDate": "2099-01-01", "operationId": "x"},
                "invalid_id",
                "operationId",
            ),
        ],
    )
    async def test_rejects_bad_plans_before_saving(
        self,
        api: httpx.AsyncClient,
        postgrest: FakePostgrest,
        body: dict[str, str],
        code: str,
        field: str,
    ) -> None:
        response = await api.post("/api/v1/schedule", json=body, headers=ALEX)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == code
        assert response.json()["error"]["field"] == field
        assert not touched_schedule(postgrest)

    async def test_allows_planning_up_to_a_year_ahead(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest
    ) -> None:
        postgrest.routines = []
        today = earliest_today()
        limit = date.fromordinal(today.toordinal() + MAX_DAYS_AHEAD).isoformat()

        response = await api.post(
            "/api/v1/schedule", json={"routineId": ROUTINE_ID, "localDate": limit}, headers=ALEX
        )

        # Past validation; the fake database has no such routine.
        assert response.json()["error"]["code"] == "not_found"

    @pytest.mark.parametrize("body", [{}, {"localDate": "2000-01-01"}, {"localDate": 20991231}])
    async def test_rejects_bad_reschedules_before_saving(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, body: dict[str, object]
    ) -> None:
        response = await api.patch(f"/api/v1/schedule/{SCHEDULE_ID}", json=body, headers=ALEX)
        assert response.status_code == 422
        assert postgrest.requests == []

    @pytest.mark.parametrize(
        ("method", "path"),
        [("PATCH", "/api/v1/schedule/nope"), ("POST", "/api/v1/schedule/nope/cancel")],
    )
    async def test_rejects_a_malformed_id(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str, path: str
    ) -> None:
        response = await api.request(method, path, json={"localDate": "2099-01-01"}, headers=ALEX)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_id"
        assert postgrest.requests == []

    @pytest.mark.parametrize("name", ["fromDate", "toDate"])
    async def test_rejects_a_bad_date_range(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, name: str
    ) -> None:
        response = await api.get("/api/v1/schedule", params={name: "soon"}, headers=ALEX)
        assert response.status_code == 422
        assert response.json()["error"]["field"] == name
        assert postgrest.requests == []

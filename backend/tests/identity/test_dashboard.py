from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.features.identity.dashboard import summarize_session

from ..conftest import bearer, make_token
from .conftest import ALEX_ID, BAILEY_ID, FakePostgrest, new_id

pytestmark = pytest.mark.anyio

ALEX = bearer(make_token("alex"))
BAILEY = bearer(make_token("bailey"))
ROUTINE = "11111111-0000-4000-8000-000000000001"


def plan(
    owner: str, local_date: str, status: str = "planned", title: str = "Push"
) -> dict[str, Any]:
    return {
        "id": new_id(),
        "owner_id": owner,
        "routine_id": ROUTINE,
        "routine_title": title,
        "local_date": local_date,
        "status": status,
        "created_at": "2026-11-01T10:00:00+00:00",
        "updated_at": "2026-11-01T10:00:00+00:00",
    }


def session(
    owner: str, started: str, ended: str | None, status: str = "completed"
) -> dict[str, Any]:
    return {
        "id": new_id(),
        "owner_id": owner,
        "routine_name_snapshot": "Push day",
        "status": status,
        "started_at": started,
        "ended_at": ended,
    }


def entry(owner: str, session_id: str) -> dict[str, Any]:
    return {"id": new_id(), "owner_id": owner, "session_id": session_id}


def logged(
    owner: str, entry_id: str, reps: int, kg: float | None, *, deleted: bool = False, when: str
) -> dict[str, Any]:
    return {
        "id": new_id(),
        "owner_id": owner,
        "session_exercise_id": entry_id,
        "reps": reps,
        "weight_kg": kg,
        "load_mode": "bodyweight" if kg is None else "weighted",
        "is_deleted": deleted,
        "completed_at": when,
    }


class TestSummarizeSession:
    def test_counts_live_sets_and_weighted_volume_only(self) -> None:
        s = session(ALEX_ID, "2026-11-06T17:00:00+00:00", "2026-11-06T17:45:30+00:00")
        bench, push_ups, skipped = (entry(ALEX_ID, s["id"]) for _ in range(3))
        when = "2026-11-06T17:10:00+00:00"
        sets = [
            logged(ALEX_ID, bench["id"], 5, 60.5, when=when),
            logged(ALEX_ID, bench["id"], 5, 60.5, when=when),
            logged(ALEX_ID, bench["id"], 5, 100, deleted=True, when=when),
            logged(ALEX_ID, push_ups["id"], 12, None, when=when),
        ]
        summary = summarize_session(s, [bench, push_ups, skipped], sets)
        assert summary.set_count == 3
        assert summary.exercise_count == 2
        assert summary.weighted_volume_kg == 605.0
        assert summary.duration_seconds == 2730

    def test_bodyweight_only_has_no_volume_rather_than_zero(self) -> None:
        s = session(ALEX_ID, "2026-11-06T17:00:00+00:00", "2026-11-06T17:20:00+00:00")
        e = entry(ALEX_ID, s["id"])
        summary = summarize_session(
            s, [e], [logged(ALEX_ID, e["id"], 10, None, when="2026-11-06T17:05:00+00:00")]
        )
        assert summary.weighted_volume_kg is None

    def test_volume_is_exact_in_decimal(self) -> None:
        s = session(ALEX_ID, "2026-11-06T17:00:00+00:00", "2026-11-06T17:20:00+00:00")
        e = entry(ALEX_ID, s["id"])
        sets = [logged(ALEX_ID, e["id"], 3, 0.1, when="2026-11-06T17:05:00+00:00")] * 3
        assert summarize_session(s, [e], sets).weighted_volume_kg == 0.9


@pytest.fixture
def seeded(db: FakePostgrest) -> FakePostgrest:
    """Alex (Los Angeles) has plans, workouts and sets; Bailey has her own."""
    db.tables["scheduled_workouts"] += [
        # 2026-11-07 02:30 UTC is still Nov 6 in Los Angeles.
        plan(ALEX_ID, "2026-11-06", title="Legs"),
        plan(ALEX_ID, "2026-11-06", status="canceled", title="Canceled"),
        plan(ALEX_ID, "2026-11-08", title="Pull"),
        plan(ALEX_ID, "2026-11-05", title="Yesterday"),
        plan(BAILEY_ID, "2026-11-06", title="Bailey's plan"),
    ]
    old = session(ALEX_ID, "2026-10-20T17:00:00+00:00", "2026-10-20T18:00:00+00:00")
    recent = session(ALEX_ID, "2026-11-05T17:00:00+00:00", "2026-11-05T17:40:00+00:00")
    stopped = session(
        ALEX_ID, "2026-11-04T17:00:00+00:00", "2026-11-04T17:05:00+00:00", status="stopped"
    )
    active = session(ALEX_ID, "2026-11-07T02:00:00+00:00", None, status="active")
    bailey = session(BAILEY_ID, "2026-11-06T09:00:00+00:00", "2026-11-06T10:00:00+00:00")
    db.tables["workout_sessions"] += [old, recent, stopped, active, bailey]
    e = entry(ALEX_ID, recent["id"])
    b = entry(BAILEY_ID, bailey["id"])
    db.tables["session_exercises"] += [e, b]
    db.tables["set_logs"] += [
        logged(ALEX_ID, e["id"], 5, 50, when="2026-11-05T17:10:00+00:00"),
        logged(ALEX_ID, e["id"], 5, 50, when="2026-11-05T17:15:00+00:00"),
        logged(ALEX_ID, e["id"], 5, 50, deleted=True, when="2026-11-05T17:20:00+00:00"),
        logged(BAILEY_ID, b["id"], 8, 20, when="2026-11-06T09:10:00+00:00"),
    ]
    return db


@pytest.fixture
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.features.identity.dashboard as dashboard

    real = dashboard.get_dashboard

    async def at_fixed_time(db: Any, user: Any, now: datetime | None = None) -> Any:
        return await real(db, user, now=datetime(2026, 11, 7, 2, 30, tzinfo=UTC))

    monkeypatch.setattr(dashboard, "get_dashboard", at_fixed_time)


@pytest.mark.usefixtures("seeded", "frozen_now")
class TestDashboardEndpoint:
    async def test_shows_today_in_the_users_time_zone(self, api: httpx.AsyncClient) -> None:
        data = (await api.get("/api/v1/dashboard", headers=ALEX)).json()["data"]
        assert data["today"] == "2026-11-06"
        assert data["profile"]["displayUnit"] == "lb"
        assert [w["routineTitle"] for w in data["todaysWorkouts"]] == ["Legs"]
        assert [w["routineTitle"] for w in data["upcomingWorkouts"]] == ["Pull"]

    async def test_offers_the_active_workout_to_resume(self, api: httpx.AsyncClient) -> None:
        data = (await api.get("/api/v1/dashboard", headers=ALEX)).json()["data"]
        assert data["activeWorkout"]["startedAt"] == "2026-11-07T02:00:00Z"

    async def test_lists_recent_finished_sessions_newest_first(
        self, api: httpx.AsyncClient
    ) -> None:
        data = (await api.get("/api/v1/dashboard", headers=ALEX)).json()["data"]
        recent = data["recentSessions"]
        assert [s["status"] for s in recent] == ["completed", "stopped", "completed"]
        assert recent[0]["setCount"] == 2
        assert recent[0]["weightedVolumeKg"] == 500
        assert recent[0]["durationSeconds"] == 2400
        assert recent[1]["setCount"] == 0

    async def test_progress_counts_only_the_callers_finished_work(
        self, api: httpx.AsyncClient
    ) -> None:
        data = (await api.get("/api/v1/dashboard", headers=ALEX)).json()["data"]
        assert data["progress"] == {
            "sessionsLast7Days": 1,
            "sessionsLast30Days": 2,
            "setsLast7Days": 2,
        }

    async def test_never_includes_another_users_records(self, api: httpx.AsyncClient) -> None:
        alex = (await api.get("/api/v1/dashboard", headers=ALEX)).text
        assert "Bailey" not in alex
        bailey = (await api.get("/api/v1/dashboard", headers=BAILEY)).json()["data"]
        assert bailey["today"] == "2026-11-07"  # Bailey is on UTC
        assert bailey["todaysWorkouts"] == []
        assert bailey["activeWorkout"] is None
        assert [s["setCount"] for s in bailey["recentSessions"]] == [1]
        assert bailey["progress"]["setsLast7Days"] == 1

    async def test_every_personal_query_filters_by_the_caller(
        self, api: httpx.AsyncClient, db: FakePostgrest
    ) -> None:
        await api.get("/api/v1/dashboard", headers=BAILEY)
        for request in db.requests:
            table = request.url.path.rsplit("/", 1)[-1]
            if table == "scheduled_workouts":
                continue  # the planning lane's query; RLS scopes it
            owner = "user_id" if table == "profiles" else "owner_id"
            assert request.url.params[owner] == f"eq.{BAILEY_ID}", request.url


async def test_dashboard_for_a_brand_new_user_is_empty_not_an_error(
    api: httpx.AsyncClient,
) -> None:
    data = (await api.get("/api/v1/dashboard", headers=BAILEY)).json()["data"]
    assert data["todaysWorkouts"] == []
    assert data["upcomingWorkouts"] == []
    assert data["activeWorkout"] is None
    assert data["recentSessions"] == []
    assert data["progress"] == {"sessionsLast7Days": 0, "sessionsLast30Days": 0, "setsLast7Days": 0}


async def test_dashboard_requires_sign_in(api: httpx.AsyncClient) -> None:
    response = await api.get("/api/v1/dashboard")
    assert response.status_code == 401

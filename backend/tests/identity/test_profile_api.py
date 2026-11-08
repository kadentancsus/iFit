from __future__ import annotations

import json

import httpx
import pytest

from ..conftest import bearer, make_token
from .conftest import ALEX_ID, BAILEY_ID, FakePostgrest, profile_row

pytestmark = pytest.mark.anyio

ALEX = bearer(make_token("alex"))
BAILEY = bearer(make_token("bailey"))


async def test_returns_the_callers_own_profile(api: httpx.AsyncClient) -> None:
    response = await api.get("/api/v1/profile", headers=ALEX)
    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "userId": ALEX_ID,
            "displayName": "Alex",
            "displayUnit": "lb",
            "timezone": "America/Los_Angeles",
            "createdAt": "2026-11-07T10:00:00Z",
            "updatedAt": "2026-11-07T10:00:00Z",
        },
        "error": None,
    }


async def test_two_users_each_see_only_their_own(api: httpx.AsyncClient) -> None:
    alex = (await api.get("/api/v1/profile", headers=ALEX)).json()["data"]
    bailey = (await api.get("/api/v1/profile", headers=BAILEY)).json()["data"]
    assert alex["userId"] == ALEX_ID
    assert bailey["userId"] == BAILEY_ID
    assert bailey["displayName"] == "Bailey"


async def test_queries_are_scoped_to_the_verified_user(
    api: httpx.AsyncClient, db: FakePostgrest
) -> None:
    await api.get("/api/v1/profile", headers=ALEX)
    [request] = db.requests
    assert request.url.params["user_id"] == f"eq.{ALEX_ID}"
    assert request.headers["authorization"] == ALEX["Authorization"]


async def test_requires_sign_in(api: httpx.AsyncClient, db: FakePostgrest) -> None:
    for method in ("GET", "PATCH"):
        response = await api.request(method, "/api/v1/profile", json={"displayUnit": "kg"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "not_authenticated"
    assert db.requests == []


async def test_updates_only_the_fields_sent(api: httpx.AsyncClient, db: FakePostgrest) -> None:
    response = await api.patch("/api/v1/profile", headers=ALEX, json={"displayUnit": "kg"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["displayUnit"] == "kg"
    assert data["displayName"] == "Alex"
    assert data["timezone"] == "America/Los_Angeles"
    patch = next(r for r in db.requests if r.method == "PATCH")
    assert json.loads(patch.content) == {"display_unit": "kg"}
    assert patch.url.params["user_id"] == f"eq.{ALEX_ID}"
    # Bailey is untouched.
    assert db.visible("profiles", BAILEY_ID)[0]["display_unit"] == "kg"
    assert db.visible("profiles", BAILEY_ID)[0]["display_name"] == "Bailey"


async def test_trims_the_display_name(api: httpx.AsyncClient) -> None:
    response = await api.patch(
        "/api/v1/profile",
        headers=ALEX,
        json={"displayName": "  Alex R  ", "timezone": "Europe/London"},
    )
    assert response.json()["data"]["displayName"] == "Alex R"
    assert response.json()["data"]["timezone"] == "Europe/London"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, None),
        ({"displayName": ""}, "displayName"),
        ({"displayName": "x" * 51}, "displayName"),
        ({"displayUnit": "stone"}, "displayUnit"),
        ({"timezone": "Mars/Olympus"}, "timezone"),
        ({"displayName": None}, None),
        ({"userId": BAILEY_ID}, "userId"),
    ],
)
async def test_rejects_invalid_changes_before_touching_the_database(
    api: httpx.AsyncClient, db: FakePostgrest, body: dict[str, object], field: str | None
) -> None:
    response = await api.patch("/api/v1/profile", headers=ALEX, json=body)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_input"
    if field:
        assert error["field"] == field
    assert db.requests == []


async def test_reports_a_time_zone_the_database_rejects(api: httpx.AsyncClient) -> None:
    # Valid for Python's zoneinfo but not in the fake's pg_timezone_names.
    response = await api.patch("/api/v1/profile", headers=ALEX, json={"timezone": "Asia/Tokyo"})
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_input",
        "message": "That time zone isn't supported. Pick one from the list.",
        "field": "timezone",
    }


async def test_creates_a_missing_profile_without_sending_a_user_id(
    api: httpx.AsyncClient, db: FakePostgrest
) -> None:
    db.tables["profiles"] = [profile_row(BAILEY_ID, "Bailey")]
    response = await api.get("/api/v1/profile", headers=ALEX)
    assert response.status_code == 200
    assert response.json()["data"]["displayName"] == "alex"  # from alex@ifit.test
    insert = next(r for r in db.requests if r.method == "POST")
    assert json.loads(insert.content) == {"display_name": "alex"}


async def test_hides_database_failures(api: httpx.AsyncClient, db: FakePostgrest) -> None:
    db.fail_with = httpx.Response(500, json={"code": "XX000", "message": "secret internals"})
    response = await api.get("/api/v1/profile", headers=ALEX)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "internals" not in response.text


async def test_reports_a_token_postgrest_rejects_as_expired(
    api: httpx.AsyncClient, db: FakePostgrest
) -> None:
    db.fail_with = httpx.Response(401, json={"code": "PGRST303", "message": "JWT expired"})
    response = await api.get("/api/v1/profile", headers=ALEX)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_session"

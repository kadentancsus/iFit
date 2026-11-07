"""Routine endpoints without a database: sign-in, validation and error handling.

Persistence, ordering and ownership are proven against real Postgres and
PostgREST in ``tests/integration``. A fake PostgREST stands in here, and records
every request so tests can show that rejected input never reaches the database.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI
from postgrest import AsyncPostgrestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.supabase import get_user_database
from tests.conftest import EXPIRED_TOKEN, bearer, make_token

pytestmark = pytest.mark.anyio

ALEX = bearer(make_token("alex"))
ROUTINE_ID = "11111111-0000-4000-8000-000000000001"
BENCH_ID = "e1f17000-0000-4000-8000-000000000001"
PUSH_UP_ID = "e1f17000-0000-4000-8000-000000000002"

CATALOG = [
    {"id": BENCH_ID, "name": "Barbell Bench Press", "load_convention": "total"},
    {"id": PUSH_UP_ID, "name": "Push-Up", "load_convention": "bodyweight"},
]
SAVED_ROW = {
    "id": ROUTINE_ID,
    "title": "Push day",
    "updated_at": "2026-11-07T10:00:00+00:00",
    "routine_exercises": [],
}


def planned(exercise_id: str = BENCH_ID, **overrides: object) -> dict[str, object]:
    return {
        "exerciseId": exercise_id,
        "targetSets": 3,
        "targetReps": 10,
        "targetKg": None,
        "restSeconds": 90,
        **overrides,
    }


class FakePostgrest:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.saved_id: str | None = ROUTINE_ID
        self.routines: list[dict[str, object]] = [SAVED_ROW]
        self.failure: httpx.Response | None = None

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.failure is not None:
            return self.failure
        if request.url.path.endswith("/exercises"):
            return httpx.Response(200, json=CATALOG)
        if request.url.path.endswith("/rpc/save_routine"):
            return httpx.Response(200, content=json.dumps(self.saved_id))
        return httpx.Response(200, json=self.routines)

    @property
    def rpc_calls(self) -> list[dict[str, object]]:
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith("/rpc/save_routine")
        ]


@pytest.fixture
def postgrest() -> FakePostgrest:
    return FakePostgrest()


@pytest.fixture
async def api(
    build_app: Callable[[], FastAPI], postgrest: FakePostgrest
) -> AsyncIterator[httpx.AsyncClient]:
    app = build_app()

    # Keeps the real sign-in check, which get_user_database normally brings with it.
    async def fake_database(
        _: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AsyncIterator[AsyncPostgrestClient]:
        http_client = httpx.AsyncClient(
            base_url="http://postgrest.test", transport=httpx.MockTransport(postgrest)
        )
        client = AsyncPostgrestClient(
            "http://postgrest.test", http_client=http_client, retry_enabled=False
        )
        yield client
        await client.aclose()

    app.dependency_overrides[get_user_database] = fake_database

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/routines"),
        ("GET", f"/api/v1/routines/{ROUTINE_ID}"),
        ("POST", "/api/v1/routines"),
        ("PUT", f"/api/v1/routines/{ROUTINE_ID}"),
        ("DELETE", f"/api/v1/routines/{ROUTINE_ID}"),
    ],
)
class TestSignInIsRequired:
    async def test_without_a_token(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str, path: str
    ) -> None:
        response = await api.request(method, path, json={"title": "x", "exercises": []})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "not_authenticated"
        assert postgrest.requests == []

    async def test_with_an_expired_token(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str, path: str
    ) -> None:
        response = await api.request(
            method, path, json={"title": "x", "exercises": []}, headers=bearer(EXPIRED_TOKEN)
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_session"
        assert postgrest.requests == []


class TestValidation:
    @pytest.mark.parametrize(
        ("body", "code", "field"),
        [
            ({"title": "   ", "exercises": []}, "invalid_title", "title"),
            ({"title": "x" * 81, "exercises": []}, "invalid_title", "title"),
            ({"title": "Push"}, "invalid_input", "exercises"),
            ([], "invalid_input", None),
            (
                {"title": "Push", "exercises": [planned(targetReps=0)]},
                "invalid_target",
                "exercises.0.targetReps",
            ),
            (
                {"title": "Push", "exercises": [planned(targetSets=2.5)]},
                "invalid_target",
                "exercises.0.targetSets",
            ),
            (
                {"title": "Push", "exercises": [planned(restSeconds=601)]},
                "invalid_target",
                "exercises.0.restSeconds",
            ),
            (
                {"title": "Push", "exercises": [planned(targetKg=-1)]},
                "invalid_target",
                "exercises.0.targetKg",
            ),
            (
                {"title": "Push", "exercises": [planned(PUSH_UP_ID, targetKg=10)]},
                "load_not_applicable",
                "exercises.0.targetKg",
            ),
            (
                {"title": "Push", "exercises": [planned("not-a-uuid")]},
                "unknown_exercise",
                "exercises.0.exerciseId",
            ),
            (
                {
                    "title": "Push",
                    "exercises": [planned("99999999-0000-4000-8000-000000000001")],
                },
                "unknown_exercise",
                "exercises.0.exerciseId",
            ),
            (
                {"title": "Push", "exercises": [planned(exerciseId=["not", "hashable"])]},
                "unknown_exercise",
                "exercises.0.exerciseId",
            ),
            (
                {"title": "Push", "exercises": [planned()] * 31},
                "too_many_exercises",
                "exercises",
            ),
            ({"title": "Push", "exercises": [], "operationId": "nope"}, "invalid_id", "operationId"),
        ],
    )
    async def test_rejects_bad_input_before_saving(
        self,
        api: httpx.AsyncClient,
        postgrest: FakePostgrest,
        body: object,
        code: str,
        field: str | None,
    ) -> None:
        response = await api.post("/api/v1/routines", json=body, headers=ALEX)
        assert response.status_code == 422
        assert response.json()["data"] is None
        assert response.json()["error"]["code"] == code
        assert response.json()["error"]["field"] == field
        assert postgrest.rpc_calls == []

    async def test_rejects_malformed_json(self, api: httpx.AsyncClient) -> None:
        response = await api.post(
            "/api/v1/routines",
            content=b"{not json",
            headers={**ALEX, "Content-Type": "application/json"},
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_input"

    @pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
    async def test_rejects_a_malformed_routine_id(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str
    ) -> None:
        response = await api.request(
            method,
            "/api/v1/routines/not-a-uuid",
            json={"title": "Push", "exercises": []},
            headers=ALEX,
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_id"
        assert postgrest.rpc_calls == []

    async def test_a_new_routine_cannot_choose_its_id(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest
    ) -> None:
        response = await api.post(
            "/api/v1/routines",
            json={"id": ROUTINE_ID, "title": "Push", "exercises": []},
            headers=ALEX,
        )
        assert response.status_code == 422
        assert response.json()["error"]["field"] == "id"
        assert postgrest.rpc_calls == []

    async def test_the_body_id_must_match_the_path(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest
    ) -> None:
        response = await api.put(
            f"/api/v1/routines/{ROUTINE_ID}",
            json={"id": "22222222-0000-4000-8000-000000000001", "title": "Push", "exercises": []},
            headers=ALEX,
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_id"
        assert postgrest.rpc_calls == []


class TestSaving:
    async def test_sends_only_validated_fields(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest
    ) -> None:
        response = await api.post(
            "/api/v1/routines",
            json={
                "title": "  Push  ",
                "ownerId": "bbbbbbbb-0000-4000-8000-000000000001",
                "exercises": [planned(BENCH_ID.upper(), targetKg=40, ownerId="x")],
            },
            headers=ALEX,
        )
        assert response.status_code == 201
        assert postgrest.rpc_calls == [
            {
                "p_routine_id": None,
                "p_title": "Push",
                "p_exercises": [
                    {
                        "id": None,
                        "exerciseId": BENCH_ID,
                        "targetSets": 3,
                        "targetReps": 10,
                        "targetKg": 40,
                        "restSeconds": 90,
                    }
                ],
                "p_operation_id": None,
            }
        ]

    async def test_updating_a_missing_routine_is_not_found(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest
    ) -> None:
        postgrest.saved_id = None
        response = await api.put(
            f"/api/v1/routines/{ROUTINE_ID}",
            json={"title": "Push", "exercises": []},
            headers=ALEX,
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "routine_not_found"

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    async def test_a_missing_routine_is_not_found(
        self, api: httpx.AsyncClient, postgrest: FakePostgrest, method: str
    ) -> None:
        postgrest.routines = []
        response = await api.request(method, f"/api/v1/routines/{ROUTINE_ID}", headers=ALEX)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "routine_not_found"


async def test_database_errors_stay_private(
    api: httpx.AsyncClient, postgrest: FakePostgrest
) -> None:
    postgrest.failure = httpx.Response(
        500, json={"code": "XX000", "message": "secret table detail", "details": None, "hint": None}
    )
    response = await api.get("/api/v1/routines", headers=ALEX)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "secret" not in response.text

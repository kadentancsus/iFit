"""HTTP contract checks with a mocked PostgREST transport, not persistence proof."""

import json
from collections.abc import AsyncIterator

import httpx
import pytest
from postgrest import AsyncPostgrestClient

from app.core.config import Settings
from app.core.supabase import get_user_database
from app.features.workout.router import router
from app.main import create_app

pytestmark = pytest.mark.anyio
ID = "11111111-1111-4111-8111-111111111111"
OWNER = "aaaaaaaa-0000-4000-8000-000000000001"
TOKEN = "header.alex.signature"  # noqa: S105 -- inert test-only Auth fixture


async def test_workout_router_validates_auth_and_input(settings: Settings) -> None:
    app = create_app(settings)
    app.include_router(router, prefix="/api/v1")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        assert (await client.get("/api/v1/workouts/active")).status_code == 401


async def test_log_rpc_sends_actual_values_and_preserves_operation(settings: Settings) -> None:
    requests: list[httpx.Request] = []

    def database(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "id": ID,
                "owner_id": OWNER,
                "session_exercise_id": ID,
                "operation_id": body["p_operation_id"],
                "ordinal": 1,
                "reps": body["p_reps"],
                "weight_kg": body["p_weight_kg"],
                "load_mode": body["p_load_mode"],
                "is_deleted": False,
                "completed_at": "2026-11-07T12:00:00Z",
                "created_at": "2026-11-07T12:00:00Z",
                "updated_at": "2026-11-07T12:00:00Z",
            },
        )

    auth = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"id": OWNER, "email": "alex@ifit.test"})
        )
    )
    app = create_app(settings, auth_http_client=auth)
    app.include_router(router, prefix="/api/v1")

    async def db() -> AsyncIterator[AsyncPostgrestClient]:
        client = AsyncPostgrestClient(
            "https://test/rest/v1",
            http_client=httpx.AsyncClient(
                base_url="https://test/rest/v1",
                transport=httpx.MockTransport(database),
            ),
            retry_enabled=False,
        )
        try:
            yield client
        finally:
            await client.aclose()

    app.dependency_overrides[get_user_database] = db
    payload = {
        "sessionExerciseId": ID,
        "operationId": ID,
        "reps": 7,
        "weightKg": 22.5,
        "loadMode": "weighted",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/sets", headers={"Authorization": f"Bearer {TOKEN}"}, json=payload
        )
        assert response.status_code == 200
        assert response.json()["data"]["reps"] == 7
        assert response.json()["data"]["weightKg"] == 22.5
        assert "ownerId" not in response.json()["data"]
        assert requests[0].url.path.endswith("/rpc/workout_log_set")
        assert json.loads(requests[0].content)["p_operation_id"] == ID
        payload["reps"] = 0
        assert (
            await client.post(
                "/api/v1/sets", headers={"Authorization": f"Bearer {TOKEN}"}, json=payload
            )
        ).status_code == 422
        assert len(requests) == 1
    await auth.aclose()

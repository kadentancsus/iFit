"""App wiring: the shared response shape, error handling and CORS."""

from __future__ import annotations

import httpx
import pytest

pytestmark = pytest.mark.anyio


async def test_health_uses_the_shared_response_shape(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok"}, "error": None}


async def test_unknown_routes_return_a_not_found_error(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json() == {
        "data": None,
        "error": {"code": "not_found", "message": "That page or record doesn't exist.", "field": None},
    }


async def test_wrong_method_returns_a_shared_error(client: httpx.AsyncClient) -> None:
    response = await client.delete("/api/v1/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"


async def test_allows_the_configured_frontend_origin(client: httpx.AsyncClient) -> None:
    response = await client.options(
        "/api/v1/session",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in response.headers


async def test_blocks_other_origins(client: httpx.AsyncClient) -> None:
    preflight = await client.options(
        "/api/v1/session",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in preflight.headers

    simple = await client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in simple.headers


async def test_openapi_describes_the_api(client: httpx.AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()
    assert {"/api/v1/health", "/api/v1/session"} <= set(schema["paths"])




@pytest.mark.parametrize("feature", ["identity", "planning", "workout"])
def test_every_feature_router_is_mounted(feature: str) -> None:
    """A router that isn't included in the app silently serves 404s."""
    import importlib

    from fastapi import FastAPI

    from app.main import create_app

    def endpoints(app: FastAPI) -> set[tuple[str, str]]:
        return {
            (method, path)
            for path, operations in app.openapi()["paths"].items()
            for method in operations
        }

    alone = FastAPI()
    alone.include_router(importlib.import_module(f"app.features.{feature}.router").router, prefix="/api/v1")
    expected = endpoints(alone)
    assert expected
    assert expected <= endpoints(create_app())

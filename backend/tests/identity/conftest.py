"""A small in-memory PostgREST for identity endpoint tests.

It understands the filters these endpoints use (eq, neq, in, gte, order,
limit, exact counts) and applies an owner-only rule like Row-Level Security,
so tests can show each query is scoped to the caller. The real policies are
tested against Postgres in tests/integration and supabase/tests.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Annotated, Any

import httpx
import pytest
from fastapi import Depends, FastAPI
from postgrest import AsyncPostgrestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.supabase import get_user_database

from ..conftest import USERS, make_token

ALEX_ID = USERS[make_token("alex")]["id"]
BAILEY_ID = USERS[make_token("bailey")]["id"]
TOKENS_TO_USERS = {token: user["id"] for token, user in USERS.items()}

#: Which column holds the owner in each table.
OWNER_COLUMN = {
    "profiles": "user_id",
    "scheduled_workouts": "owner_id",
    "workout_sessions": "owner_id",
    "session_exercises": "owner_id",
    "set_logs": "owner_id",
}
VALID_TIMEZONES = {"UTC", "America/Los_Angeles", "Europe/London", "Pacific/Auckland"}
NOW = "2026-11-07T10:00:00+00:00"


def profile_row(user_id: str, name: str, **overrides: Any) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "display_name": name,
        "display_unit": "kg",
        "timezone": "UTC",
        "created_at": NOW,
        "updated_at": NOW,
        **overrides,
    }


def _matches(row: dict[str, Any], column: str, expression: str) -> bool:
    operator, _, value = expression.partition(".")
    actual = row.get(column)
    if operator == "eq":
        return (
            str(actual).lower() == value.lower()
            if isinstance(actual, bool)
            else str(actual) == value
        )
    if operator == "neq":
        return str(actual) != value
    if operator == "in":
        return str(actual) in value.strip("()").split(",")
    if operator == "gte":
        return str(actual) >= value
    if operator == "lte":
        return str(actual) <= value
    raise AssertionError(f"fake PostgREST does not support {operator!r}")


class FakePostgrest:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {name: [] for name in OWNER_COLUMN}
        self.requests: list[httpx.Request] = []
        self.fail_with: httpx.Response | None = None

    def visible(self, table: str, user_id: str) -> list[dict[str, Any]]:
        """Row-Level Security: owners see only their own rows."""
        owner = OWNER_COLUMN[table]
        return [row for row in self.tables[table] if row[owner] == user_id]

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail_with is not None:
            return self.fail_with
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        user_id = TOKENS_TO_USERS.get(token)
        if user_id is None:
            return httpx.Response(401, json={"code": "PGRST301", "message": "JWT invalid"})

        table = request.url.path.rsplit("/", 1)[-1]
        params = [(k, v) for k, v in request.url.params.multi_items()]
        filters = [(k, v) for k, v in params if k not in {"select", "order", "limit", "columns"}]
        selected = [
            row
            for row in self.visible(table, user_id)
            if all(_matches(row, column, expression) for column, expression in filters)
        ]

        if request.method == "POST":
            body = json.loads(request.content)
            owner = OWNER_COLUMN[table]
            if owner in body:  # the API must never send an owner ID
                return httpx.Response(403, json={"code": "42501", "message": "permission denied"})
            if any(row[owner] == user_id for row in self.tables[table]) and table == "profiles":
                return httpx.Response(409, json={"code": "23505", "message": "duplicate key"})
            row = profile_row(user_id, body["display_name"]) | body
            self.tables[table].append(row)
            return httpx.Response(201, json=[row])

        if request.method == "PATCH":
            body = json.loads(request.content)
            if "timezone" in body and body["timezone"] not in VALID_TIMEZONES:
                return httpx.Response(
                    400, json={"code": "23514", "message": "invalid time zone", "details": None}
                )
            for row in selected:
                row.update(body, updated_at="2026-11-07T11:00:00+00:00")
            return httpx.Response(200, json=selected)

        for key, value in params:
            if key == "order":
                for part in reversed(value.split(",")):
                    column, _, direction = part.partition(".")
                    selected.sort(
                        key=lambda r: str(r[column]), reverse=direction.startswith("desc")
                    )
        limit = dict(params).get("limit")
        if limit:
            selected = selected[: int(limit)]

        # Return only the selected columns, like PostgREST (embeds are ignored).
        columns = [
            c for c in dict(params).get("select", "*").split(",") if c != "*" and "(" not in c
        ]
        if columns:
            selected = [{c: row[c] for c in columns if c in row} for row in selected]

        headers = {}
        if "count=exact" in request.headers.get("prefer", ""):
            headers["Content-Range"] = f"*/{len(selected)}"
        if request.method == "HEAD":
            return httpx.Response(200, headers=headers)
        return httpx.Response(200, json=selected, headers=headers)


@pytest.fixture
def db() -> FakePostgrest:
    fake = FakePostgrest()
    fake.tables["profiles"] += [
        profile_row(ALEX_ID, "Alex", display_unit="lb", timezone="America/Los_Angeles"),
        profile_row(BAILEY_ID, "Bailey"),
    ]
    return fake


@pytest.fixture
async def api(
    build_app: Callable[[], FastAPI], db: FakePostgrest
) -> AsyncIterator[httpx.AsyncClient]:
    app = build_app()

    # Same per-request client as the real one: the caller's own token, no service key.
    async def database(
        user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AsyncIterator[AsyncPostgrestClient]:
        headers = {"Authorization": f"Bearer {user.access_token}"}
        http_client = httpx.AsyncClient(
            base_url="http://postgrest.test", headers=headers, transport=httpx.MockTransport(db)
        )
        client = AsyncPostgrestClient(
            "http://postgrest.test", headers=headers, http_client=http_client, retry_enabled=False
        )
        try:
            yield client
        finally:
            await client.aclose()

    app.dependency_overrides[get_user_database] = database
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def new_id() -> str:
    return str(uuid.uuid4())

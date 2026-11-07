"""Routine endpoints.

Request bodies are read as raw JSON rather than a Pydantic model so that
``validators.py`` can report each failure with its own stable code and field.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body

from app.core.responses import ApiResponse, ok
from app.core.supabase import UserDatabase

from . import service
from .schemas import DeletedRoutine, RoutineDetail, RoutineSummary

router = APIRouter(prefix="/routines", tags=["planning"])

RoutineBody = Annotated[Any, Body(description="A RoutineInput, in camelCase JSON.")]


@router.get("", response_model=ApiResponse[list[RoutineSummary]])
async def list_routines(db: UserDatabase) -> ApiResponse[list[RoutineSummary]]:
    """The caller's routines, most recently changed first."""
    return ok(await service.list_routines(db))


@router.get("/{routine_id}", response_model=ApiResponse[RoutineDetail])
async def get_routine(routine_id: str, db: UserDatabase) -> ApiResponse[RoutineDetail]:
    return ok(await service.get_routine(db, routine_id))


@router.post("", status_code=201, response_model=ApiResponse[RoutineDetail])
async def create_routine(payload: RoutineBody, db: UserDatabase) -> ApiResponse[RoutineDetail]:
    """Creates a routine. Resending the same ``operationId`` returns the first result."""
    return ok(await service.create_routine(db, payload))


@router.put("/{routine_id}", response_model=ApiResponse[RoutineDetail])
async def update_routine(
    routine_id: str, payload: RoutineBody, db: UserDatabase
) -> ApiResponse[RoutineDetail]:
    """Replaces the routine. List order is the new order; rows left out are removed."""
    return ok(await service.update_routine(db, routine_id, payload))


@router.delete("/{routine_id}", response_model=ApiResponse[DeletedRoutine])
async def delete_routine(routine_id: str, db: UserDatabase) -> ApiResponse[DeletedRoutine]:
    return ok(await service.delete_routine(db, routine_id))

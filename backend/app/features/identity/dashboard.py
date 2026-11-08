"""The dashboard: today's plan, an active workout to resume, recent sessions
and a private progress summary, all from the caller's own records.

Every query runs as the caller (RLS) and is also filtered by their verified ID.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from postgrest import AsyncPostgrestClient
from postgrest.types import CountMethod

from app.contracts.identity import ActiveWorkoutRef, Dashboard, ProgressSummary
from app.contracts.planning import ScheduledWorkout
from app.contracts.workout import WorkoutSummary
from app.core.auth import AuthenticatedUser
from app.core.database import execute, rows
from app.core.dates import add_days, duration_seconds, local_date_in
from app.features.planning.schedule import list_schedule

from .profile import get_profile

RECENT_SESSIONS = 5
UPCOMING_DAYS = 7
UPCOMING_LIMIT = 5
_SESSION_COLUMNS = "id,routine_name_snapshot,status,started_at,ended_at"


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def summarize_session(
    session: dict[str, Any],
    entries: Iterable[dict[str, Any]],
    sets: Iterable[dict[str, Any]],
) -> WorkoutSummary:
    """One finished or stopped session as a history row.

    Only sets that still exist count. Volume adds up reps x kg for weighted
    sets only; bodyweight sets are left out rather than counted as zero, and
    the volume is None when nothing was weighted.
    """
    live_sets = [s for s in sets if not s.get("is_deleted")]
    exercises_with_sets = {s["session_exercise_id"] for s in live_sets}
    entry_ids = {entry["id"] for entry in entries}

    weighted = [s for s in live_sets if s["load_mode"] == "weighted" and s["weight_kg"] is not None]
    volume = (
        float(sum(Decimal(str(s["weight_kg"])) * s["reps"] for s in weighted)) if weighted else None
    )

    ended = session.get("ended_at")
    return WorkoutSummary(
        id=session["id"],
        routine_name_snapshot=session["routine_name_snapshot"],
        status=session["status"],
        started_at=session["started_at"],
        ended_at=ended,
        duration_seconds=(
            duration_seconds(_parse_time(session["started_at"]), _parse_time(ended))
            if ended
            else None
        ),
        exercise_count=len(exercises_with_sets & entry_ids),
        set_count=len(live_sets),
        weighted_volume_kg=volume,
    )


async def recent_sessions(
    db: AsyncPostgrestClient, user_id: str, limit: int = RECENT_SESSIONS
) -> list[WorkoutSummary]:
    """The caller's latest finished or stopped workouts, newest first."""
    sessions = await rows(
        db.table("workout_sessions")
        .select(_SESSION_COLUMNS)
        .eq("owner_id", user_id)
        .neq("status", "active")
        .order("started_at", desc=True)
        .limit(limit)
    )
    if not sessions:
        return []

    entries = await rows(
        db.table("session_exercises")
        .select("id,session_id")
        .eq("owner_id", user_id)
        .in_("session_id", [s["id"] for s in sessions])
    )
    sets = (
        await rows(
            db.table("set_logs")
            .select("session_exercise_id,reps,weight_kg,load_mode,is_deleted")
            .eq("owner_id", user_id)
            .in_("session_exercise_id", [e["id"] for e in entries])
        )
        if entries
        else []
    )

    entries_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        entries_by_session[entry["session_id"]].append(entry)
    sets_by_entry: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for logged in sets:
        sets_by_entry[logged["session_exercise_id"]].append(logged)

    return [
        summarize_session(
            session,
            entries_by_session[session["id"]],
            [s for e in entries_by_session[session["id"]] for s in sets_by_entry[e["id"]]],
        )
        for session in sessions
    ]


async def active_workout(db: AsyncPostgrestClient, user_id: str) -> ActiveWorkoutRef | None:
    found = await rows(
        db.table("workout_sessions")
        .select("id,routine_name_snapshot,started_at")
        .eq("owner_id", user_id)
        .eq("status", "active")
        .limit(1)
    )
    return ActiveWorkoutRef.model_validate(found[0]) if found else None


async def _count(query: Any) -> int:
    return (await execute(query)).count or 0


async def progress_summary(
    db: AsyncPostgrestClient, user_id: str, now: datetime
) -> ProgressSummary:
    """Counts of the caller's own finished workouts and logged sets."""
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    def finished_since(since: str) -> Any:
        return (
            db.table("workout_sessions")
            .select("id", count=CountMethod.exact, head=True)
            .eq("owner_id", user_id)
            .eq("status", "completed")
            .gte("started_at", since)
        )

    week, month, sets = await asyncio.gather(
        _count(finished_since(week_ago)),
        _count(finished_since(month_ago)),
        _count(
            db.table("set_logs")
            .select("id", count=CountMethod.exact, head=True)
            .eq("owner_id", user_id)
            .eq("is_deleted", False)
            .gte("completed_at", week_ago)
        ),
    )
    return ProgressSummary(
        sessions_last_7_days=week, sessions_last_30_days=month, sets_last_7_days=sets
    )


def split_schedule(
    plans: Iterable[ScheduledWorkout], today: str
) -> tuple[list[ScheduledWorkout], list[ScheduledWorkout]]:
    """Today's workouts (planned or already done) and the next planned ones."""
    plans = list(plans)
    todays = [p for p in plans if p.local_date == today and p.status != "canceled"]
    upcoming = [p for p in plans if p.local_date > today and p.status == "planned"]
    return todays, upcoming[:UPCOMING_LIMIT]


async def get_dashboard(
    db: AsyncPostgrestClient, user: AuthenticatedUser, now: datetime | None = None
) -> Dashboard:
    now = now or datetime.now(UTC)
    profile = await get_profile(db, user)
    today = local_date_in(profile.timezone, now)

    plans, active, recent, progress = await asyncio.gather(
        list_schedule(db, start=today, end=add_days(today, UPCOMING_DAYS)),
        active_workout(db, user.id),
        recent_sessions(db, user.id),
        progress_summary(db, user.id, now),
    )
    todays, upcoming = split_schedule((p for p in plans if str(p.owner_id) == user.id), today)
    return Dashboard(
        profile=profile,
        today=today,
        todays_workouts=tuple(todays),
        upcoming_workouts=tuple(upcoming),
        active_workout=active,
        recent_sessions=tuple(recent),
        progress=progress,
    )

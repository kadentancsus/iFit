"""The exercise catalog: public and read-only, written only by the seed."""

from __future__ import annotations

import re

from postgrest import AsyncPostgrestClient

from app.contracts.catalog import AlternativeOption, Exercise, LastPerformance
from app.contracts.common import AlternativeKind, Equipment, MovementPattern, Muscle
from app.core.responses import ApiError

from .database import run
from .validators import is_uuid

_COLUMNS = (
    "id,slug,name,pattern,primary_muscles,secondary_muscles,equipment,load_convention,"
    "difficulty,summary,instructions,cues,mistakes,asset_path,motion_asset_path,asset_alt"
)
_PATTERN_ORDER: tuple[MovementPattern, ...] = ("push", "pull", "squat", "hinge", "core")
_SLUG = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")


async def list_exercises(
    db: AsyncPostgrestClient,
    *,
    search: str | None = None,
    pattern: MovementPattern | None = None,
    equipment: Equipment | None = None,
    muscle: Muscle | None = None,
) -> list[Exercise]:
    """Filters in Python: the catalog is a few dozen rows, and this avoids
    escaping user search text into a PostgREST filter."""
    rows = await run(db.table("exercises").select(_COLUMNS))
    exercises = [Exercise.model_validate(row) for row in rows]
    needle = (search or "").strip().casefold()
    matches = [
        exercise
        for exercise in exercises
        if needle in exercise.name.casefold()
        and pattern in (None, exercise.pattern)
        and equipment in (None, exercise.equipment)
        and (
            muscle is None
            or muscle in exercise.primary_muscles
            or muscle in exercise.secondary_muscles
        )
    ]
    return sorted(
        matches, key=lambda exercise: (_PATTERN_ORDER.index(exercise.pattern), exercise.name)
    )


async def get_exercise(db: AsyncPostgrestClient, id_or_slug: str) -> Exercise:
    """Accepts the exercise ID or its slug, so pages can use readable URLs."""
    if is_uuid(id_or_slug):
        column = "id"
    elif len(id_or_slug) <= 80 and _SLUG.fullmatch(id_or_slug):
        column = "slug"
    else:
        raise _exercise_not_found()
    rows = await run(db.table("exercises").select(_COLUMNS).eq(column, id_or_slug))
    if not rows:
        raise _exercise_not_found()
    return Exercise.model_validate(rows[0])


async def get_alternatives(
    db: AsyncPostgrestClient,
    id_or_slug: str,
    kind: AlternativeKind,
    *,
    equipment: Equipment | None = None,
    user_db: AsyncPostgrestClient | None = None,
) -> list[AlternativeOption]:
    """Curated substitutions or easier variations, best first.

    With ``user_db`` each option carries the caller's last result for that
    exact exercise and load type, which is the only load the app may prefill.
    A load is never carried over from the exercise being replaced.
    """
    source = await get_exercise(db, id_or_slug)
    rows = await run(
        db.table("exercise_alternatives")
        .select(
            f"kind,rationale,position,"
            f"exercises!exercise_alternatives_target_exercise_id_fkey({_COLUMNS})"
        )
        .eq("source_exercise_id", str(source.id))
        .eq("kind", kind)
        .order("position")
    )
    options = [
        AlternativeOption(
            kind=row["kind"],
            rationale=row["rationale"],
            position=row["position"],
            exercise=Exercise.model_validate(row["exercises"]),
        )
        for row in rows
    ]
    options = [option for option in options if equipment in (None, option.exercise.equipment)]
    if user_db is None:
        return options
    return [
        option.model_copy(
            update={"last_performance": await _last_performance(user_db, option.exercise)}
        )
        for option in options
    ]


async def _last_performance(
    db: AsyncPostgrestClient, exercise: Exercise
) -> LastPerformance | None:
    """The caller's newest saved set of this exact exercise and load type."""
    rows = await run(
        db.table("set_logs")
        .select(
            "reps,weight_kg,load_mode,completed_at,"
            "session_exercises!inner(exercise_id,load_convention_snapshot)"
        )
        .eq("is_deleted", False)
        .eq("session_exercises.exercise_id", str(exercise.id))
        .eq("session_exercises.load_convention_snapshot", exercise.load_convention)
        .order("completed_at", desc=True)
        .limit(1)
    )
    if not rows:
        return None
    return LastPerformance.model_validate(
        {key: rows[0][key] for key in ("reps", "weight_kg", "load_mode", "completed_at")}
    )


def _exercise_not_found() -> ApiError:
    return ApiError(404, "not_found", "We couldn't find that exercise.")

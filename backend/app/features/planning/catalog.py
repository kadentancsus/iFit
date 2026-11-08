"""The exercise catalog: public and read-only, written only by the seed."""

from __future__ import annotations

import re

from postgrest import AsyncPostgrestClient

from app.core.responses import ApiError

from .database import run
from .schemas import Equipment, ExerciseDetail, ExerciseSummary, MovementPattern, Muscle
from .validators import is_uuid

_SUMMARY_COLUMNS = (
    "id,slug,name,pattern,primary_muscles,secondary_muscles,equipment,load_convention,"
    "difficulty,summary,asset_path,asset_alt"
)
_DETAIL_COLUMNS = f"{_SUMMARY_COLUMNS},instructions,cues,mistakes,motion_asset_path"
_PATTERN_ORDER: tuple[MovementPattern, ...] = ("push", "pull", "squat", "hinge", "core")
_SLUG = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")


async def list_exercises(
    db: AsyncPostgrestClient,
    *,
    search: str | None = None,
    pattern: MovementPattern | None = None,
    equipment: Equipment | None = None,
    muscle: Muscle | None = None,
) -> list[ExerciseSummary]:
    """Filters in Python: the catalog is a few dozen rows, and this avoids
    escaping user search text into a PostgREST filter."""
    rows = await run(db.table("exercises").select(_SUMMARY_COLUMNS))
    exercises = [ExerciseSummary.model_validate(row) for row in rows]
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


async def get_exercise(db: AsyncPostgrestClient, id_or_slug: str) -> ExerciseDetail:
    """Accepts the exercise ID or its slug, so pages can use readable URLs."""
    if is_uuid(id_or_slug):
        column = "id"
    elif len(id_or_slug) <= 80 and _SLUG.fullmatch(id_or_slug):
        column = "slug"
    else:
        raise _exercise_not_found()
    rows = await run(db.table("exercises").select(_DETAIL_COLUMNS).eq(column, id_or_slug))
    if not rows:
        raise _exercise_not_found()
    return ExerciseDetail.model_validate(rows[0])


def _exercise_not_found() -> ApiError:
    return ApiError(404, "exercise_not_found", "We couldn't find that exercise.")

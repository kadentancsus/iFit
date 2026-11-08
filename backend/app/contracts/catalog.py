"""Exercise catalog contracts (Sukhdip's lane implements the endpoints)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, Field

from app.contracts.common import (
    AlternativeKind,
    ContractModel,
    Equipment,
    Kilograms,
    LoadConvention,
    LoadMode,
    MovementPattern,
    Muscle,
)


class Exercise(ContractModel):
    id: UUID
    slug: str
    name: str
    pattern: MovementPattern
    primary_muscles: tuple[Muscle, ...]
    secondary_muscles: tuple[Muscle, ...]
    equipment: Equipment
    load_convention: LoadConvention
    difficulty: Annotated[int, Field(ge=1, le=3)]
    summary: str
    instructions: tuple[str, ...]
    #: Exactly three, short enough to read between sets.
    cues: tuple[str, str, str]
    mistakes: tuple[str, ...]
    #: Static diagram under /public; use for prefers-reduced-motion.
    asset_path: str
    motion_asset_path: str
    asset_alt: str


class ExerciseFilters(ContractModel):
    """Query parameters for ``listExercises``. All optional."""

    search: Annotated[str, Field(max_length=80)] | None = None
    pattern: MovementPattern | None = None
    equipment: Equipment | None = None
    muscle: Muscle | None = None


class LastPerformance(ContractModel):
    """The user's most recent logged set of one exercise, used to prefill.

    Loads never transfer between exercises, so this is always for the exact
    exercise being shown.
    """

    reps: int
    weight_kg: Kilograms | None
    load_mode: LoadMode
    completed_at: AwareDatetime


class AlternativeOption(ContractModel):
    """One suggestion from ``getAlternatives``."""

    kind: AlternativeKind
    #: Shown to the user as the reason for the suggestion.
    rationale: str
    position: int
    exercise: Exercise
    #: The user's own prior result for this alternative, if any.
    last_performance: LastPerformance | None = None

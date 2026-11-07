"""Routine exercise ordering helpers."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

T = TypeVar("T")


def move_item(items: Sequence[T], from_index: object, to_index: object) -> list[T]:
    """Moves one item to a new index and returns a new list.

    Out-of-range moves return an unchanged copy, so a stale tap on a list that
    just changed is harmless.
    """
    result = list(items)

    def in_range(index: object) -> bool:
        return (
            isinstance(index, int)
            and not isinstance(index, bool)
            and 0 <= index < len(items)
        )

    if not in_range(from_index) or not in_range(to_index):
        return result
    assert isinstance(from_index, int) and isinstance(to_index, int)
    moved = result.pop(from_index)
    result.insert(to_index, moved)
    return result


def with_positions(items: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Assigns contiguous zero-based positions from list order, ready to persist."""
    return [{**item, "position": position} for position, item in enumerate(items)]

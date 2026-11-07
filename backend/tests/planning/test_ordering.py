"""Routine ordering helpers. Mirrors the moveItem/withPositions Vitest cases."""

from __future__ import annotations

import pytest

from app.features.planning import move_item, with_positions

ITEMS = ["a", "b", "c", "d"]


def test_moves_an_item_later() -> None:
    assert move_item(ITEMS, 0, 2) == ["b", "c", "a", "d"]


def test_moves_an_item_earlier() -> None:
    assert move_item(ITEMS, 3, 1) == ["a", "d", "b", "c"]


def test_does_not_change_the_original_list() -> None:
    move_item(ITEMS, 0, 3)
    assert ITEMS == ["a", "b", "c", "d"]


@pytest.mark.parametrize(("from_index", "to_index"), [(-1, 1), (1, 4), (4, 1), (0.5, 1), (True, 1)])
def test_ignores_out_of_range_moves(from_index: object, to_index: object) -> None:
    assert move_item(ITEMS, from_index, to_index) == ITEMS


def test_numbers_items_from_zero_in_list_order() -> None:
    assert with_positions([{"id": "a"}, {"id": "b"}]) == [
        {"id": "a", "position": 0},
        {"id": "b", "position": 1},
    ]


def test_renumbers_after_a_move_leaving_no_gaps() -> None:
    moved = move_item(with_positions([{"id": "a"}, {"id": "b"}, {"id": "c"}]), 2, 0)
    assert [(row["id"], row["position"]) for row in with_positions(moved)] == [
        ("c", 0),
        ("a", 1),
        ("b", 2),
    ]

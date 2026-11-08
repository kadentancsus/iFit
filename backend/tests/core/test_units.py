"""Weight conversion. Uses the same fixture file as frontend/src/lib/units.test.ts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.units import display_to_kg, kg_to_display, round_half_up

FIXTURES: dict[str, list[dict[str, Any]]] = json.loads(
    (
        Path(__file__).resolve().parents[3] / "frontend/src/lib/__fixtures__/unit-conversions.json"
    ).read_text()
)


@pytest.mark.parametrize("case", FIXTURES["roundHalfUp"])
def test_round_half_up_matches_frontend(case: dict[str, Any]) -> None:
    assert round_half_up(case["value"], case["places"]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["kgToDisplay"])
def test_kg_to_display_matches_frontend(case: dict[str, Any]) -> None:
    assert kg_to_display(case["kg"], case["unit"]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["displayToKg"])
def test_display_to_kg_matches_frontend(case: dict[str, Any]) -> None:
    assert display_to_kg(case["value"], case["unit"]) == case["expected"]


def test_rounds_negatives_away_from_zero() -> None:
    assert round_half_up(-2.25, 1) == -2.3


def test_every_half_pound_round_trips() -> None:
    for halves in range(0, 4410):
        pounds = halves / 2
        assert kg_to_display(display_to_kg(pounds, "lb"), "lb") == pounds

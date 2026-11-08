"""Canonical weight units.

Weights are stored in kilograms (``numeric(7, 3)``) and converted only at the
edges. Rounding is half-up on the shortest decimal form of the number, the same
rule as ``frontend/src/lib/units.ts``; both are checked against
``frontend/src/lib/__fixtures__/unit-conversions.json``.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Final, Literal

DisplayUnit = Literal["kg", "lb"]

#: Exact, by international definition.
KG_PER_LB: Final = 0.45359237
#: Highest load any table accepts.
MAX_LOAD_KG: Final = 1000
#: Decimal places stored in the database.
STORED_KG_PLACES: Final = 3
#: Decimal places shown to people.
DISPLAY_PLACES: Final = 1


def round_half_up(value: float, places: int) -> float:
    """Rounds ``2.25`` to ``2.3`` and ``-2.25`` to ``-2.3`` (away from zero)."""
    exponent = Decimal(1).scaleb(-places)
    return float(Decimal(repr(value)).quantize(exponent, rounding=ROUND_HALF_UP))


def kg_to_display(kg: float, unit: DisplayUnit) -> float:
    """A stored kilogram value as the number shown in ``unit``."""
    value = kg if unit == "kg" else kg / KG_PER_LB
    return round_half_up(value, DISPLAY_PLACES)


def display_to_kg(value: float, unit: DisplayUnit) -> float:
    """A number entered in ``unit`` as the kilogram value to store."""
    kg = value if unit == "kg" else value * KG_PER_LB
    return round_half_up(kg, STORED_KG_PLACES)

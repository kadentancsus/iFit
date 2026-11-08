"""The Python contracts and frontend/src/lib/contracts.ts must say the same thing."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, get_args

import pytest

from app.contracts import common
from app.contracts.operations import OPERATIONS
from app.core.units import DisplayUnit

CONTRACTS_TS = (Path(__file__).resolve().parents[3] / "frontend/src/lib/contracts.ts").read_text()


def ts_const_array(name: str) -> tuple[str, ...]:
    match = re.search(rf"export const {name} = \[(.*?)\] as const;", CONTRACTS_TS, re.S)
    assert match, f"{name} not found in contracts.ts"
    return tuple(re.findall(r"'([^']*)'", match.group(1)))


@pytest.mark.parametrize(
    ("ts_name", "python_type"),
    [
        ("DISPLAY_UNITS", DisplayUnit),
        ("LOAD_CONVENTIONS", common.LoadConvention),
        ("LOAD_MODES", common.LoadMode),
        ("SESSION_STATUSES", common.SessionStatus),
        ("SCHEDULE_STATUSES", common.ScheduleStatus),
        ("ALTERNATIVE_KINDS", common.AlternativeKind),
        ("EQUIPMENT_TYPES", common.Equipment),
        ("MOVEMENT_PATTERNS", common.MovementPattern),
        ("MUSCLES", common.Muscle),
        ("ERROR_CODES", common.ErrorCode),
    ],
)
def test_value_sets_match(ts_name: str, python_type: Any) -> None:
    assert ts_const_array(ts_name) == get_args(python_type)


def test_rest_routes_match() -> None:
    block = re.search(r"export const API_ROUTES = \{(.*?)\} as const;", CONTRACTS_TS, re.S)
    assert block
    ts_routes = re.findall(r"(\w+): \{ method: '(\w+)', path: '([^']+)' \}", block.group(1))
    python_routes = [(op.name, op.method, op.path) for op in OPERATIONS]
    assert ts_routes == python_routes

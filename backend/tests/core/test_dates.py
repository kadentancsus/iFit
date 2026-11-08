from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.dates import (
    add_days,
    duration_seconds,
    is_local_date,
    is_valid_timezone,
    local_date_in,
)


@pytest.mark.parametrize(
    ("name", "valid"),
    [
        ("America/Los_Angeles", True),
        ("UTC", True),
        ("Mars/Olympus", False),
        ("", False),
        ("../../etc/passwd", False),
        ("x" * 65, False),
    ],
)
def test_timezones(name: str, valid: bool) -> None:
    assert is_valid_timezone(name) is valid


@pytest.mark.parametrize(
    ("value", "valid"),
    [
        ("2026-11-07", True),
        ("2028-02-29", True),
        ("2026-02-29", False),
        ("2026-11-7", False),
        ("2026-11-07T00:00:00Z", False),
        ("\uff12\uff10\uff12\uff16-11-07", False),  # full-width digits
    ],
)
def test_local_dates(value: str, valid: bool) -> None:
    assert is_local_date(value) is valid


def test_today_depends_on_the_users_zone() -> None:
    instant = datetime(2026, 11, 7, 2, 30, tzinfo=UTC)
    assert local_date_in("UTC", instant) == "2026-11-07"
    assert local_date_in("America/Los_Angeles", instant) == "2026-11-06"


def test_rejects_naive_instants() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        local_date_in("UTC", datetime(2026, 11, 7))


def test_add_days_and_durations() -> None:
    assert add_days("2026-12-31", 1) == "2027-01-01"
    assert add_days("2026-03-01", -1) == "2026-02-28"
    start = datetime(2026, 11, 7, 10, tzinfo=UTC)
    end = datetime(2026, 11, 7, 10, 45, 30, 900000, tzinfo=UTC)
    assert duration_seconds(start, end) == 2730
    assert duration_seconds(end, start) == 0

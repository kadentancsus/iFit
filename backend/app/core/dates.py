"""Canonical date and time rules.

Timestamps are UTC instants. Calendar dates (``YYYY-MM-DD``) are the user's
local date in their profile time zone, never the server's. Mirrors
``frontend/src/lib/dates.ts``.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_LOCAL_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def is_valid_timezone(name: str) -> bool:
    """True for IANA names such as ``America/Los_Angeles`` or ``UTC``."""
    if not name or len(name) > 64:
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def is_local_date(value: str) -> bool:
    """True for a real calendar date written as ``YYYY-MM-DD`` (rejects 2026-02-30)."""
    if not _LOCAL_DATE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def local_date_in(timezone: str, instant: datetime | None = None) -> str:
    """The calendar date at ``instant`` (default: now) in ``timezone``."""
    moment = instant or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("instant must be timezone-aware")
    return moment.astimezone(ZoneInfo(timezone)).date().isoformat()


def add_days(local_date: str, days: int) -> str:
    return (date.fromisoformat(local_date) + timedelta(days=days)).isoformat()


def duration_seconds(started_at: datetime, ended_at: datetime) -> int:
    """Whole seconds between two instants, never negative."""
    return max(0, int((ended_at - started_at).total_seconds()))

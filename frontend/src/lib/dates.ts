/**
 * Canonical date and time rules. Timestamps are UTC ISO strings; calendar
 * dates (`YYYY-MM-DD`) are the user's local date in their profile time zone,
 * never the browser's or the server's. Mirrors `backend/app/core/dates.py`.
 */

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for IANA names such as `America/Los_Angeles` or `UTC`. */
export function isValidTimeZone(name: string): boolean {
  if (!name || name.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30). */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function assertLocalDate(value: string): void {
  if (!isLocalDate(value)) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
}

/** The calendar date at `instant` (default: now) in `timeZone`. */
export function localDateIn(timeZone: string, instant: Date | number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Noon UTC on a local date: a stable instant that formats as that same date in UTC. */
function noonUtc(localDate: string): Date {
  assertLocalDate(localDate);
  return new Date(`${localDate}T12:00:00Z`);
}

export function addDays(localDate: string, days: number): string {
  const date = noonUtc(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `Sat, Nov 7` (short) or `Saturday, November 7, 2026` (long). */
export function formatLocalDate(
  localDate: string,
  style: 'short' | 'long' = 'short',
  locale = 'en-US',
): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(noonUtc(localDate));
}

/** `Today`, `Tomorrow`, `Yesterday`, otherwise the short date. */
export function relativeDayLabel(localDate: string, today: string, locale = 'en-US'): string {
  if (localDate === today) return 'Today';
  if (localDate === addDays(today, 1)) return 'Tomorrow';
  if (localDate === addDays(today, -1)) return 'Yesterday';
  return formatLocalDate(localDate, 'short', locale);
}

/** A UTC timestamp as a clock time in the user's zone, e.g. `6:30 PM`. */
export function formatTime(isoTimestamp: string, timeZone: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(isoTimestamp),
  );
}

/** Whole seconds between two UTC timestamps, never negative. */
export function durationSeconds(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms)) throw new RangeError('Invalid timestamp.');
  return Math.max(0, Math.floor(ms / 1000));
}

/** A workout length: `< 1 min`, `45 min`, `1 h 5 min`, `2 h`. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A countdown display: `0:05`, `1:30`, `1:00:00`. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

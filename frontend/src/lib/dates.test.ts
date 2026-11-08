import { describe, expect, it } from 'vitest';

import {
  addDays,
  durationSeconds,
  formatClock,
  formatDuration,
  formatLocalDate,
  formatTime,
  isLocalDate,
  isValidTimeZone,
  localDateIn,
  relativeDayLabel,
} from './dates';

describe('time zones', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('x'.repeat(65))).toBe(false);
  });
});

describe('local dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2026-11-07')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-11-7')).toBe(false);
    expect(isLocalDate('2026-11-07T00:00:00Z')).toBe(false);
    expect(isLocalDate(20261107)).toBe(false);
  });

  it("uses the user's zone, not the machine's, to decide what day it is", () => {
    // 02:30 UTC on Nov 7 is still the evening of Nov 6 in Los Angeles.
    const instant = Date.parse('2026-11-07T02:30:00Z');
    expect(localDateIn('UTC', instant)).toBe('2026-11-07');
    expect(localDateIn('America/Los_Angeles', instant)).toBe('2026-11-06');
    expect(localDateIn('Pacific/Auckland', instant)).toBe('2026-11-07');
  });

  it('adds days across month, year and daylight-saving boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US DST ends Nov 1, 2026
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });

  it('formats a local date without shifting it a day', () => {
    expect(formatLocalDate('2026-11-07')).toBe('Sat, Nov 7');
    expect(formatLocalDate('2026-11-07', 'long')).toBe('Saturday, November 7, 2026');
  });

  it('labels nearby days in words', () => {
    expect(relativeDayLabel('2026-11-07', '2026-11-07')).toBe('Today');
    expect(relativeDayLabel('2026-11-08', '2026-11-07')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-11-06', '2026-11-07')).toBe('Yesterday');
    expect(relativeDayLabel('2026-11-10', '2026-11-07')).toBe('Tue, Nov 10');
  });
});

describe('times and durations', () => {
  it('shows a UTC timestamp in the given zone', () => {
    expect(formatTime('2026-11-07T02:30:00Z', 'America/Los_Angeles')).toBe('6:30 PM');
    expect(formatTime('2026-11-07T02:30:00Z', 'UTC')).toBe('2:30 AM');
  });

  it('measures whole seconds and never goes negative', () => {
    expect(durationSeconds('2026-11-07T10:00:00Z', '2026-11-07T10:45:30.900Z')).toBe(2730);
    expect(durationSeconds('2026-11-07T10:00:00Z', '2026-11-07T09:00:00Z')).toBe(0);
    expect(() => durationSeconds('bad', '2026-11-07T09:00:00Z')).toThrow(RangeError);
  });

  it('formats workout lengths', () => {
    expect(formatDuration(30)).toBe('< 1 min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(65 * 60)).toBe('1 h 5 min');
    expect(formatDuration(120 * 60 + 59)).toBe('2 h');
  });

  it('formats a countdown clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(4.2)).toBe('0:05');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});

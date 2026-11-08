import { describe, expect, it } from 'vitest';

import type { ScheduledWorkout } from './api';
import { addDays, dayLabel, localToday, splitSchedule } from './schedule-dates';

const workout = (
  localDate: string,
  status: ScheduledWorkout['status'] = 'planned',
): ScheduledWorkout => ({
  id: `${localDate}-${status}`,
  ownerId: 'o',
  routineId: 'r',
  routineTitle: 'Push day',
  localDate,
  status,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
});

describe('schedule dates', () => {
  it("uses the device's own calendar date, not UTC", () => {
    // 11:30pm local time; toISOString() would already say the next day in the US.
    expect(localToday(new Date(2026, 10, 7, 23, 30))).toBe('2026-11-07');
  });

  it.each([
    ['2026-11-07', 1, '2026-11-08'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-11-01', -1, '2026-10-31'],
    ['2026-11-07', 366, '2027-11-08'],
  ])('adds days across month, year and DST boundaries: %s %+d', (start, days, expected) => {
    expect(addDays(start, days)).toBe(expected);
  });

  it.each([
    ['2026-11-07', 'Today'],
    ['2026-11-08', 'Tomorrow'],
    ['2026-11-06', 'Yesterday'],
    ['2026-11-12', 'Thursday, Nov 12'],
  ])('labels %s as %s', (date, label) => {
    expect(dayLabel(date, '2026-11-07')).toBe(label);
  });

  it('splits upcoming plans from history without judging unfinished ones', () => {
    const { upcoming, recent } = splitSchedule(
      [
        workout('2026-11-09'),
        workout('2026-11-07'),
        workout('2026-11-08', 'canceled'),
        workout('2026-11-05'),
        workout('2026-11-06', 'completed'),
      ],
      '2026-11-07',
    );

    expect(upcoming.map((item) => item.localDate)).toEqual(['2026-11-07', '2026-11-09']);
    expect(recent.map((item) => [item.localDate, item.status])).toEqual([
      ['2026-11-08', 'canceled'],
      ['2026-11-06', 'completed'],
      ['2026-11-05', 'planned'],
    ]);
  });
});

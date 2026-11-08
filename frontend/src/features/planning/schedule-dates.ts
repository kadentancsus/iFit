import type { ScheduledWorkout } from './api';

const pad = (value: number) => String(value).padStart(2, '0');

/** The user's own calendar date, as `YYYY-MM-DD`, from the device clock. */
export const localToday = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Calendar arithmetic in UTC so daylight-saving changes can't skip or repeat a day. */
export function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

const weekday = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function dayLabel(localDate: string, today: string): string {
  if (localDate === today) return 'Today';
  if (localDate === addDays(today, 1)) return 'Tomorrow';
  if (localDate === addDays(today, -1)) return 'Yesterday';
  return weekday.format(new Date(`${localDate}T00:00:00Z`));
}

export const STATUS_LABELS: Record<ScheduledWorkout['status'], string> = {
  planned: 'Planned',
  completed: 'Done',
  canceled: 'Canceled',
};

/**
 * Upcoming plans soonest first, and everything else most recent first. A past
 * plan that wasn't finished stays "Planned": iFit doesn't mark workouts missed.
 */
export function splitSchedule(items: readonly ScheduledWorkout[], today: string) {
  const isUpcoming = (item: ScheduledWorkout) =>
    item.status === 'planned' && item.localDate >= today;
  return {
    upcoming: items
      .filter(isUpcoming)
      .sort((a, b) => a.localDate.localeCompare(b.localDate)),
    recent: items
      .filter((item) => !isUpcoming(item))
      .sort((a, b) => b.localDate.localeCompare(a.localDate)),
  };
}

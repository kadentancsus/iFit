/** Wording for the dashboard, kept pure so it is easy to test. */
import type { DisplayUnit, ProgressSummary, WorkoutSummary } from '@/lib/contracts';
import { formatDuration } from '@/lib/dates';
import { formatWeight } from '@/lib/units';

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

/** `40 min · 2 exercises · 12 sets · 2,400 kg lifted`, skipping what's unknown. */
export function sessionDetails(session: WorkoutSummary, unit: DisplayUnit): string {
  const parts: string[] = [];
  if (session.durationSeconds !== null) parts.push(formatDuration(session.durationSeconds));
  parts.push(plural(session.exerciseCount, 'exercise'), plural(session.setCount, 'set'));
  if (session.weightedVolumeKg !== null) {
    parts.push(`${formatWeight(session.weightedVolumeKg, unit)} lifted`);
  }
  return parts.join(' · ');
}

export function sessionStatusLabel(session: WorkoutSummary): string | null {
  return session.status === 'stopped' ? 'Ended early' : null;
}

/** Stat tiles. Counts only; no streaks or missed-day judgement. */
export function progressTiles(progress: ProgressSummary): { label: string; value: string }[] {
  return [
    { label: 'Workouts this week', value: String(progress.sessionsLast7Days) },
    { label: 'Workouts in 30 days', value: String(progress.sessionsLast30Days) },
    { label: 'Sets this week', value: String(progress.setsLast7Days) },
  ];
}

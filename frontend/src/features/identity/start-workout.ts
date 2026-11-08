/**
 * Starting today's planned workout from the dashboard, safely.
 *
 * Each planned workout keeps one operation ID until a start succeeds or fails
 * for good. A double tap, or a retry after a dropped connection, therefore
 * sends the same ID, and the database returns the first result instead of
 * creating a second session. Starting while a workout is already running
 * returns that workout, so there is only ever one active session.
 */
import type { ApiResult, StartWorkoutInput, WorkoutDetail } from '@/lib/contracts';

/** A planned workout whose routine still exists. */
export interface StartablePlan {
  id: string;
  routineId: string;
  routineTitle: string;
}

/** Failures where the start may or may not have happened, so retry with the same ID. */
const UNCERTAIN = new Set([
  'network_error',
  'bad_response',
  'request_failed',
  'database_unavailable',
  'internal_error',
  'auth_unavailable',
]);

export function isUncertainFailure(code: string): boolean {
  return UNCERTAIN.has(code);
}

export function workoutPath(sessionId: string): string {
  return `/workout/${encodeURIComponent(sessionId)}`;
}

/** Remembers one operation ID per planned workout. */
export class StartOperations {
  private readonly ids = new Map<string, string>();

  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

  idFor(scheduleId: string): string {
    let id = this.ids.get(scheduleId);
    if (!id) {
      id = this.newId();
      this.ids.set(scheduleId, id);
    }
    return id;
  }

  forget(scheduleId: string): void {
    this.ids.delete(scheduleId);
  }
}

export type StartOutcome =
  | { type: 'started'; sessionId: string }
  | { type: 'failed'; message: string; retrySafe: boolean };

export async function startPlannedWorkout(
  plan: Pick<StartablePlan, 'id' | 'routineId'>,
  start: (input: StartWorkoutInput) => Promise<ApiResult<WorkoutDetail>>,
  operations: StartOperations,
): Promise<StartOutcome> {
  const operationId = operations.idFor(plan.id);
  const result = await start({ routineId: plan.routineId, scheduleId: plan.id, operationId });

  if (result.error) {
    const retrySafe = isUncertainFailure(result.error.code);
    // A definite "no" means the next attempt is a new request with a new ID.
    if (!retrySafe) operations.forget(plan.id);
    return {
      type: 'failed',
      retrySafe,
      message: retrySafe
        ? `${result.error.message} Tapping Start again is safe; it won't start a second workout.`
        : result.error.message,
    };
  }

  operations.forget(plan.id);
  return { type: 'started', sessionId: result.data.session.id };
}

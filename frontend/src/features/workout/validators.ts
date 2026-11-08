import { WORKOUT_LIMITS } from './types';
import type { LogSetInput, RestState, StartWorkoutInput, Targets, WorkoutResult } from './types';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const whole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const load = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= WORKOUT_LIMITS.kg;
const fail = <T>(field?: string): WorkoutResult<T> => ({
  data: null,
  error: { code: 'invalid_input', message: 'Check the workout values and try again.', field },
});
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

export function validateStartWorkoutInput(value: unknown): WorkoutResult<StartWorkoutInput> {
  if (!record(value) || !onlyKeys(value, ['routineId', 'scheduleId', 'operationId'])) return fail();
  if (!uuid(value.routineId)) return fail('routineId');
  if (!uuid(value.operationId)) return fail('operationId');
  if (value.scheduleId != null && !uuid(value.scheduleId)) return fail('scheduleId');
  return {
    data: { routineId: value.routineId, operationId: value.operationId, scheduleId: value.scheduleId ?? null },
    error: null,
  };
}

export function validateLogSetInput(value: unknown): WorkoutResult<LogSetInput> {
  if (!record(value) || !onlyKeys(value, ['sessionExerciseId', 'operationId', 'reps', 'weightKg', 'loadMode'])) return fail();
  if (!uuid(value.sessionExerciseId)) return fail('sessionExerciseId');
  if (!uuid(value.operationId)) return fail('operationId');
  if (!whole(value.reps, 1, WORKOUT_LIMITS.reps)) return fail('reps');
  const ids = { sessionExerciseId: value.sessionExerciseId, operationId: value.operationId };
  if (value.loadMode === 'bodyweight' && value.weightKg === null) {
    return { data: { ...ids, reps: value.reps, loadMode: 'bodyweight', weightKg: null }, error: null };
  }
  if (value.loadMode === 'weighted' && load(value.weightKg)) {
    return { data: { ...ids, reps: value.reps, loadMode: 'weighted', weightKg: value.weightKg }, error: null };
  }
  return fail('weightKg');
}

export function validateTargets(value: unknown): WorkoutResult<Targets> {
  if (!record(value) || !onlyKeys(value, ['targetSets', 'targetReps', 'targetKg', 'restSeconds'])) return fail();
  if (!whole(value.targetSets, 1, WORKOUT_LIMITS.sets)) return fail('targetSets');
  if (!whole(value.targetReps, 1, WORKOUT_LIMITS.reps)) return fail('targetReps');
  if (value.targetKg != null && !load(value.targetKg)) return fail('targetKg');
  if (!whole(value.restSeconds, 0, WORKOUT_LIMITS.restSeconds)) return fail('restSeconds');
  return {
    data: { targetSets: value.targetSets, targetReps: value.targetReps, targetKg: value.targetKg ?? null, restSeconds: value.restSeconds },
    error: null,
  };
}

export function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(value);
  const milliseconds = Date.parse(value);
  return match !== null && Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString().slice(0, 19) === match[1];
}

export function validateRestState(value: unknown): WorkoutResult<RestState> {
  if (!record(value) || !onlyKeys(value, ['status', 'endsAt', 'remainingSeconds'])) return fail();
  const remaining = value.remainingSeconds ?? 0;
  if (!whole(remaining, 0, WORKOUT_LIMITS.restSeconds)) return fail('remainingSeconds');
  if (value.status === 'running' && isUtcTimestamp(value.endsAt) && remaining === 0) {
    return { data: { status: 'running', endsAt: value.endsAt, remainingSeconds: 0 }, error: null };
  }
  if (value.endsAt != null) return fail('endsAt');
  if (value.status === 'paused') {
    return { data: { status: 'paused', endsAt: null, remainingSeconds: remaining }, error: null };
  }
  if (value.status === 'idle' && remaining === 0) {
    return { data: { status: 'idle', endsAt: null, remainingSeconds: 0 }, error: null };
  }
  return fail('status');
}
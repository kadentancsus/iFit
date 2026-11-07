/**
 * Client-side copy of the planning rules, for instant form feedback only.
 * The FastAPI backend (backend/app/features/planning/validators.py) is the
 * authoritative check on every request; keep the two in step.
 */
import { findExerciseById } from '../catalog/queries';
import {
  ROUTINE_LIMITS,
  type PlanningError,
  type PlanningErrorCode,
  type PlanningResult,
  type RescheduleInput,
  type RoutineExerciseInput,
  type RoutineInput,
  type ScheduleInput,
  type ScheduleStatus,
} from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const fail = (code: PlanningErrorCode, message: string, field?: string): PlanningError => ({
  code,
  message,
  ...(field ? { field } : {}),
});

const ok = <T>(data: T): PlanningResult<T> => ({ data, error: null });
const rejected = (error: PlanningError): PlanningResult<never> => ({ data: null, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

const isIntegerBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Rejects impossible dates like 2026-02-30 as well as malformed strings. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function checkOptionalUuid(value: unknown, field: string): PlanningError | null {
  return value === undefined || isUuid(value)
    ? null
    : fail('invalid_id', 'That request has an invalid ID.', field);
}

function checkFutureDate(
  localDate: unknown,
  today: string | undefined,
): PlanningError | null {
  if (!isLocalDate(localDate)) {
    return fail('invalid_date', 'Choose a valid date.', 'localDate');
  }
  // ISO dates sort chronologically, so plain string comparison is correct.
  return today !== undefined && localDate < today
    ? fail('date_in_past', 'Choose today or a later date.', 'localDate')
    : null;
}

function validateRoutineExercise(
  value: unknown,
  index: number,
): PlanningResult<RoutineExerciseInput> {
  const field = `exercises.${index}`;
  if (!isRecord(value)) return rejected(fail('invalid_input', 'That exercise is invalid.', field));

  const { id, exerciseId, targetSets, targetReps, targetKg, restSeconds } = value;

  const idError = checkOptionalUuid(id, `${field}.id`);
  if (idError) return rejected(idError);

  const exercise = isUuid(exerciseId) ? findExerciseById(exerciseId) : undefined;
  if (!exercise) {
    return rejected(
      fail('unknown_exercise', 'Choose an exercise from the list.', `${field}.exerciseId`),
    );
  }
  if (!isIntegerBetween(targetSets, 1, ROUTINE_LIMITS.sets)) {
    return rejected(
      fail(
        'invalid_target',
        `Sets must be a whole number from 1 to ${ROUTINE_LIMITS.sets}.`,
        `${field}.targetSets`,
      ),
    );
  }
  if (!isIntegerBetween(targetReps, 1, ROUTINE_LIMITS.reps)) {
    return rejected(
      fail(
        'invalid_target',
        `Reps must be a whole number from 1 to ${ROUTINE_LIMITS.reps}.`,
        `${field}.targetReps`,
      ),
    );
  }
  if (!isIntegerBetween(restSeconds, 0, ROUTINE_LIMITS.restSeconds)) {
    return rejected(
      fail(
        'invalid_target',
        `Rest must be 0 to ${ROUTINE_LIMITS.restSeconds} seconds.`,
        `${field}.restSeconds`,
      ),
    );
  }

  const plannedKg = targetKg ?? null;
  if (plannedKg !== null) {
    if (exercise.loadConvention === 'bodyweight') {
      return rejected(
        fail(
          'load_not_applicable',
          `${exercise.name} uses bodyweight, so it has no target weight.`,
          `${field}.targetKg`,
        ),
      );
    }
    if (
      typeof plannedKg !== 'number' ||
      !Number.isFinite(plannedKg) ||
      plannedKg < 0 ||
      plannedKg > ROUTINE_LIMITS.kg
    ) {
      return rejected(
        fail('invalid_target', 'Enter a weight of 0 or more.', `${field}.targetKg`),
      );
    }
  }

  return ok({
    ...(id === undefined ? {} : { id: id as string }),
    exerciseId: exercise.id,
    targetSets,
    targetReps,
    targetKg: plannedKg,
    restSeconds,
  });
}

/** Trims the title and returns the routine in its submitted order. */
export function validateRoutineInput(input: unknown): PlanningResult<RoutineInput> {
  if (!isRecord(input)) return rejected(fail('invalid_input', 'That routine is invalid.'));

  const { id, title, exercises, operationId } = input;

  const idError = checkOptionalUuid(id, 'id') ?? checkOptionalUuid(operationId, 'operationId');
  if (idError) return rejected(idError);

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (trimmedTitle.length === 0 || trimmedTitle.length > ROUTINE_LIMITS.titleLength) {
    return rejected(
      fail(
        'invalid_title',
        `Give your routine a name of up to ${ROUTINE_LIMITS.titleLength} characters.`,
        'title',
      ),
    );
  }

  if (!Array.isArray(exercises)) {
    return rejected(fail('invalid_input', 'That routine is invalid.', 'exercises'));
  }
  if (exercises.length > ROUTINE_LIMITS.exercises) {
    return rejected(
      fail(
        'too_many_exercises',
        `A routine can have up to ${ROUTINE_LIMITS.exercises} exercises.`,
        'exercises',
      ),
    );
  }

  const validated: RoutineExerciseInput[] = [];
  const seenRowIds = new Set<string>();

  for (const [index, exercise] of exercises.entries()) {
    const result = validateRoutineExercise(exercise, index);
    if (result.error) return rejected(result.error);

    const rowId = result.data.id?.toLowerCase();
    if (rowId !== undefined) {
      if (seenRowIds.has(rowId)) {
        return rejected(
          fail('duplicate_entry', 'That exercise is listed twice.', `exercises.${index}.id`),
        );
      }
      seenRowIds.add(rowId);
    }
    validated.push(result.data);
  }

  return ok({
    ...(id === undefined ? {} : { id: id as string }),
    title: trimmedTitle,
    exercises: validated,
    ...(operationId === undefined ? {} : { operationId: operationId as string }),
  });
}

export interface ScheduleOptions {
  /** The user's current local date. When set, earlier dates are rejected. */
  today?: string;
}

export function validateScheduleInput(
  input: unknown,
  { today }: ScheduleOptions = {},
): PlanningResult<ScheduleInput> {
  if (!isRecord(input)) return rejected(fail('invalid_input', 'That schedule is invalid.'));

  const { routineId, localDate, operationId } = input;

  if (!isUuid(routineId)) {
    return rejected(fail('invalid_id', 'Choose a routine to schedule.', 'routineId'));
  }
  const error =
    checkOptionalUuid(operationId, 'operationId') ?? checkFutureDate(localDate, today);
  if (error) return rejected(error);

  return ok({
    routineId,
    localDate: localDate as string,
    ...(operationId === undefined ? {} : { operationId: operationId as string }),
  });
}

export function validateRescheduleInput(
  input: unknown,
  { today }: ScheduleOptions = {},
): PlanningResult<RescheduleInput> {
  if (!isRecord(input)) return rejected(fail('invalid_input', 'That schedule is invalid.'));

  const { id, localDate } = input;

  if (!isUuid(id)) return rejected(fail('invalid_id', 'That request has an invalid ID.', 'id'));

  const error = checkFutureDate(localDate, today);
  if (error) return rejected(error);

  return ok({ id, localDate: localDate as string });
}

/** Only upcoming plans can move or be canceled; finished records stay as they are. */
export const canChangeSchedule = (status: ScheduleStatus): boolean => status === 'planned';

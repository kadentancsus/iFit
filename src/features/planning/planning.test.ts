import { describe, expect, it } from 'vitest';

import { findExerciseBySlug } from '../catalog';
import {
  ROUTINE_LIMITS,
  SCHEDULE_STATUSES,
  canChangeSchedule,
  isLocalDate,
  isUuid,
  moveItem,
  validateRescheduleInput,
  validateRoutineInput,
  validateScheduleInput,
  withPositions,
} from './index';

const ROUTINE_ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const ROW_ID = '33333333-3333-4333-8333-333333333333';

const benchId = findExerciseBySlug('barbell-bench-press')?.id as string;
const pushUpId = findExerciseBySlug('push-up')?.id as string;

const plannedExercise = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: benchId,
  targetSets: 3,
  targetReps: 10,
  targetKg: 60,
  restSeconds: 90,
  ...overrides,
});

const routine = (overrides: Record<string, unknown> = {}) => ({
  title: 'Push day',
  exercises: [plannedExercise()],
  ...overrides,
});

describe('validateRoutineInput', () => {
  it('accepts a valid routine and trims its title', () => {
    const { data, error } = validateRoutineInput(routine({ title: '  Push day  ' }));

    expect(error).toBeNull();
    expect(data?.title).toBe('Push day');
    expect(data?.exercises).toEqual([plannedExercise()]);
  });

  it('allows a routine with no exercises yet', () => {
    expect(validateRoutineInput(routine({ exercises: [] })).error).toBeNull();
  });

  it('keeps the submitted exercise order', () => {
    const { data } = validateRoutineInput(
      routine({
        exercises: [plannedExercise({ exerciseId: pushUpId, targetKg: null }), plannedExercise()],
      }),
    );

    expect(data?.exercises.map(({ exerciseId }) => exerciseId)).toEqual([pushUpId, benchId]);
  });

  it('allows the same exercise twice in a routine', () => {
    const exercises = [plannedExercise(), plannedExercise()];

    expect(validateRoutineInput(routine({ exercises })).error).toBeNull();
  });

  it('treats a missing target load as no planned load', () => {
    const { data } = validateRoutineInput(
      routine({ exercises: [plannedExercise({ targetKg: undefined })] }),
    );

    expect(data?.exercises[0]?.targetKg).toBeNull();
  });

  it('accepts a zero load, such as an empty bar', () => {
    expect(
      validateRoutineInput(routine({ exercises: [plannedExercise({ targetKg: 0 })] })).error,
    ).toBeNull();
  });

  it('preserves IDs when editing', () => {
    const { data } = validateRoutineInput(
      routine({
        id: ROUTINE_ID,
        operationId: OPERATION_ID,
        exercises: [plannedExercise({ id: ROW_ID })],
      }),
    );

    expect(data?.id).toBe(ROUTINE_ID);
    expect(data?.operationId).toBe(OPERATION_ID);
    expect(data?.exercises[0]?.id).toBe(ROW_ID);
  });

  it('ignores fields it does not know, including a client-supplied owner', () => {
    const { data } = validateRoutineInput(routine({ ownerId: ROUTINE_ID, userId: ROUTINE_ID }));

    expect(data).not.toHaveProperty('ownerId');
    expect(data).not.toHaveProperty('userId');
  });

  it.each([null, undefined, 'routine', 7, []])('rejects %j as a routine', (input) => {
    expect(validateRoutineInput(input).error?.code).toBe('invalid_input');
  });

  it.each([
    ['blank', '   '],
    ['missing', undefined],
    ['non-text', 7],
    ['too long', 'x'.repeat(ROUTINE_LIMITS.titleLength + 1)],
  ])('rejects a %s title', (_label, title) => {
    const { error } = validateRoutineInput(routine({ title }));

    expect(error).toMatchObject({ code: 'invalid_title', field: 'title' });
  });

  it('accepts a title at the length limit', () => {
    const title = 'x'.repeat(ROUTINE_LIMITS.titleLength);

    expect(validateRoutineInput(routine({ title })).error).toBeNull();
  });

  it('rejects a non-array exercise list', () => {
    expect(validateRoutineInput(routine({ exercises: 'bench' })).error?.field).toBe('exercises');
  });

  it('limits the number of exercises', () => {
    const exercises = Array.from({ length: ROUTINE_LIMITS.exercises + 1 }, () => plannedExercise());

    expect(validateRoutineInput(routine({ exercises })).error?.code).toBe('too_many_exercises');
  });

  it.each([
    ['targetSets', 0],
    ['targetSets', ROUTINE_LIMITS.sets + 1],
    ['targetSets', 2.5],
    ['targetSets', '3'],
    ['targetReps', 0],
    ['targetReps', ROUTINE_LIMITS.reps + 1],
    ['targetReps', Number.NaN],
    ['restSeconds', -1],
    ['restSeconds', ROUTINE_LIMITS.restSeconds + 1],
    ['targetKg', -1],
    ['targetKg', ROUTINE_LIMITS.kg + 1],
    ['targetKg', Number.POSITIVE_INFINITY],
    ['targetKg', Number.NaN],
    ['targetKg', '60'],
  ])('rejects %s of %s', (field, value) => {
    const { error } = validateRoutineInput(
      routine({ exercises: [plannedExercise({ [field]: value })] }),
    );

    expect(error).toMatchObject({ code: 'invalid_target', field: `exercises.0.${field}` });
  });

  it('points at the exercise that failed', () => {
    const { error } = validateRoutineInput(
      routine({ exercises: [plannedExercise(), plannedExercise({ targetReps: 0 })] }),
    );

    expect(error?.field).toBe('exercises.1.targetReps');
  });

  it.each([
    ['malformed', 'bench'],
    ['unknown', ROUTINE_ID],
  ])('rejects a %s exercise ID', (_label, exerciseId) => {
    const { error } = validateRoutineInput(
      routine({ exercises: [plannedExercise({ exerciseId })] }),
    );

    expect(error?.code).toBe('unknown_exercise');
  });

  it('rejects a target load on a bodyweight exercise', () => {
    const { error } = validateRoutineInput(
      routine({ exercises: [plannedExercise({ exerciseId: pushUpId, targetKg: 10 })] }),
    );

    expect(error?.code).toBe('load_not_applicable');
    expect(error?.message).toContain('Push-Up');
  });

  it('accepts a bodyweight exercise with no target load', () => {
    const { error } = validateRoutineInput(
      routine({ exercises: [plannedExercise({ exerciseId: pushUpId, targetKg: null })] }),
    );

    expect(error).toBeNull();
  });

  it('rejects the same saved row twice, ignoring case', () => {
    const { error } = validateRoutineInput(
      routine({
        exercises: [
          plannedExercise({ id: 'ABCDEF00-0000-4000-8000-000000000000' }),
          plannedExercise({ id: 'abcdef00-0000-4000-8000-000000000000' }),
        ],
      }),
    );

    expect(error).toMatchObject({ code: 'duplicate_entry', field: 'exercises.1.id' });
  });

  it.each([
    ['id', { id: 'nope' }],
    ['operationId', { operationId: 'nope' }],
  ])('rejects a malformed %s', (field, overrides) => {
    expect(validateRoutineInput(routine(overrides)).error).toMatchObject({
      code: 'invalid_id',
      field,
    });
  });
});

describe('isLocalDate', () => {
  it.each(['2026-11-06', '2028-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isLocalDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-11-31',
    '11/06/2026',
    '2026-1-6',
    '2026-11-06T00:00:00Z',
    '',
    null,
    20261106,
  ])('rejects %j', (value) => {
    expect(isLocalDate(value)).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts upper and lower case', () => {
    expect(isUuid(ROUTINE_ID)).toBe(true);
    expect(isUuid(ROUTINE_ID.toUpperCase())).toBe(true);
  });

  it.each(['', 'nope', `${ROUTINE_ID}0`, null, 1])('rejects %j', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('validateScheduleInput', () => {
  const schedule = (overrides: Record<string, unknown> = {}) => ({
    routineId: ROUTINE_ID,
    localDate: '2026-11-10',
    ...overrides,
  });

  it('accepts a valid schedule', () => {
    expect(validateScheduleInput(schedule({ operationId: OPERATION_ID }))).toEqual({
      data: schedule({ operationId: OPERATION_ID }),
      error: null,
    });
  });

  it('accepts today', () => {
    const { error } = validateScheduleInput(schedule(), { today: '2026-11-10' });

    expect(error).toBeNull();
  });

  it('rejects a past date when today is known', () => {
    const { error } = validateScheduleInput(schedule(), { today: '2026-11-11' });

    expect(error).toMatchObject({ code: 'date_in_past', field: 'localDate' });
  });

  it('rejects an impossible date', () => {
    expect(validateScheduleInput(schedule({ localDate: '2026-02-30' })).error?.code).toBe(
      'invalid_date',
    );
  });

  it('rejects a malformed routine ID', () => {
    expect(validateScheduleInput(schedule({ routineId: 'nope' })).error?.code).toBe('invalid_id');
  });

  it('rejects a malformed operation ID', () => {
    expect(validateScheduleInput(schedule({ operationId: 'nope' })).error?.field).toBe(
      'operationId',
    );
  });

  it('rejects input that is not an object', () => {
    expect(validateScheduleInput(null).error?.code).toBe('invalid_input');
  });
});

describe('validateRescheduleInput', () => {
  it('accepts a new date', () => {
    const input = { id: ROW_ID, localDate: '2026-11-12' };

    expect(validateRescheduleInput(input, { today: '2026-11-06' })).toEqual({
      data: input,
      error: null,
    });
  });

  it('lets a past plan move forward without complaint', () => {
    const { error } = validateRescheduleInput(
      { id: ROW_ID, localDate: '2026-11-06' },
      { today: '2026-11-06' },
    );

    expect(error).toBeNull();
  });

  it('rejects moving to a past date', () => {
    const { error } = validateRescheduleInput(
      { id: ROW_ID, localDate: '2026-11-01' },
      { today: '2026-11-06' },
    );

    expect(error?.code).toBe('date_in_past');
  });

  it('rejects a malformed ID', () => {
    expect(validateRescheduleInput({ id: 'x', localDate: '2026-11-12' }).error?.code).toBe(
      'invalid_id',
    );
  });
});

describe('canChangeSchedule', () => {
  it('only allows changes to planned workouts', () => {
    expect(SCHEDULE_STATUSES.filter(canChangeSchedule)).toEqual(['planned']);
  });

  it('has no status that judges a missed session', () => {
    expect(SCHEDULE_STATUSES).not.toContain('missed');
  });
});

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an item later', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item earlier', () => {
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('does not change the original array', () => {
    moveItem(items, 0, 3);

    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it.each([
    [-1, 1],
    [1, 4],
    [4, 1],
    [0.5, 1],
  ])('ignores an out-of-range move from %s to %s', (from, to) => {
    expect(moveItem(items, from, to)).toEqual(items);
  });
});

describe('withPositions', () => {
  it('numbers items from zero in array order', () => {
    expect(withPositions([{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });

  it('renumbers after a move, leaving no gaps', () => {
    const moved = moveItem(withPositions([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), 2, 0);

    expect(withPositions(moved).map(({ id, position }) => [id, position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });
});

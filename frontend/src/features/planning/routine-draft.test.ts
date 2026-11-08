import { describe, expect, it } from 'vitest';

import { ROUTINE_TEMPLATES, findExerciseBySlug } from '../catalog';
import type { Routine } from './api';
import {
  addExercise,
  draftFromRoutine,
  draftFromTemplate,
  emptyDraft,
  moveExercise,
  removeExercise,
  replaceExercise,
  toRoutineInput,
  updateTargets,
} from './routine-draft';
import { validateRoutineInput } from './validators';

const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const ROUTINE_ID = '11111111-1111-4111-8111-111111111111';
const ROW_A = '33333333-3333-4333-8333-333333333333';
const ROW_B = '44444444-4444-4444-8444-444444444444';

const goblet = findExerciseBySlug('goblet-squat')!;
const pushUp = findExerciseBySlug('push-up')!;

const saved: Routine = {
  id: ROUTINE_ID,
  ownerId: '55555555-5555-4555-8555-555555555555',
  title: 'Legs',
  createdAt: '2026-11-07T10:00:00+00:00',
  updatedAt: '2026-11-07T10:00:00+00:00',
  exercises: [
    {
      id: ROW_A,
      routineId: ROUTINE_ID,
      exerciseId: goblet.id,
      exerciseName: goblet.name,
      loadConvention: goblet.loadConvention,
      position: 0,
      targetSets: 3,
      targetReps: 10,
      targetKg: 22.5,
      restSeconds: 90,
    },
    {
      id: ROW_B,
      routineId: ROUTINE_ID,
      exerciseId: pushUp.id,
      exerciseName: pushUp.name,
      loadConvention: pushUp.loadConvention,
      position: 1,
      targetSets: 2,
      targetReps: 12,
      targetKg: null,
      restSeconds: 60,
    },
  ],
};

const fromSaved = () => draftFromRoutine(saved, OPERATION_ID);

describe('routine drafts', () => {
  it('round-trips a saved routine unchanged', () => {
    expect(toRoutineInput(fromSaved())).toEqual({
      id: ROUTINE_ID,
      title: 'Legs',
      exercises: [
        {
          id: ROW_A,
          exerciseId: goblet.id,
          targetSets: 3,
          targetReps: 10,
          targetKg: 22.5,
          restSeconds: 90,
        },
        {
          id: ROW_B,
          exerciseId: pushUp.id,
          targetSets: 2,
          targetReps: 12,
          targetKg: null,
          restSeconds: 60,
        },
      ],
    });
  });

  it('sends the operation ID only when creating', () => {
    expect(toRoutineInput(emptyDraft(OPERATION_ID)).operationId).toBe(OPERATION_ID);
    expect(toRoutineInput(fromSaved()).operationId).toBeUndefined();
  });

  it('adds new exercises at the end with beginner defaults and no load', () => {
    const draft = addExercise(emptyDraft(OPERATION_ID), goblet, 'new-row');

    expect(draft.exercises).toEqual([
      {
        key: 'new-row',
        exerciseId: goblet.id,
        targetSets: '3',
        targetReps: '10',
        targetKg: '',
        restSeconds: '90',
      },
    ]);
    expect(toRoutineInput(draft).exercises[0]).not.toHaveProperty('id');
  });

  it('keeps each row with its targets when reordering', () => {
    const moved = moveExercise(fromSaved(), 1, 0);

    expect(moved.exercises.map((exercise) => exercise.key)).toEqual([ROW_B, ROW_A]);
    expect(toRoutineInput(moved).exercises[1]).toMatchObject({ id: ROW_A, targetKg: 22.5 });
  });

  it('ignores a move past either end of the list', () => {
    const draft = fromSaved();

    expect(moveExercise(draft, 0, -1).exercises).toEqual(draft.exercises);
    expect(moveExercise(draft, 1, 2).exercises).toEqual(draft.exercises);
  });

  it('swaps an exercise but keeps the row, its sets, reps and rest', () => {
    const machine = findExerciseBySlug('leg-press')!;
    const draft = replaceExercise(fromSaved(), ROW_A, machine.id, null);

    expect(toRoutineInput(draft).exercises[0]).toEqual({
      id: ROW_A,
      exerciseId: machine.id,
      targetSets: 3,
      targetReps: 10,
      targetKg: null,
      restSeconds: 90,
    });
    expect(draft.exercises[1]).toEqual(fromSaved().exercises[1]);
  });

  it('uses only the prior load it is given, never the old target', () => {
    const machine = findExerciseBySlug('leg-press')!;

    expect(replaceExercise(fromSaved(), ROW_A, machine.id, 110).exercises[0]?.targetKg).toBe('110');
  });

  it('removes only the chosen row', () => {
    expect(removeExercise(fromSaved(), ROW_A).exercises.map((row) => row.key)).toEqual([ROW_B]);
  });

  it('updates only the chosen row', () => {
    const draft = updateTargets(fromSaved(), ROW_B, { targetReps: '15' });

    expect(draft.exercises[0]?.targetReps).toBe('10');
    expect(draft.exercises[1]?.targetReps).toBe('15');
  });

  it.each([
    ['blank sets', { targetSets: '' }, 'exercises.0.targetSets'],
    ['blank reps', { targetReps: '   ' }, 'exercises.0.targetReps'],
    ['blank rest', { restSeconds: '' }, 'exercises.0.restSeconds'],
    ['text in reps', { targetReps: 'ten' }, 'exercises.0.targetReps'],
    ['text in load', { targetKg: 'heavy' }, 'exercises.0.targetKg'],
  ])('reports %s as an error instead of saving zero', (_name, patch, field) => {
    const input = toRoutineInput(updateTargets(fromSaved(), ROW_A, patch));

    expect(validateRoutineInput(input).error?.field).toBe(field);
  });

  it('treats a blank load as no planned load', () => {
    const input = toRoutineInput(updateTargets(fromSaved(), ROW_A, { targetKg: ' ' }));

    expect(input.exercises[0]?.targetKg).toBeNull();
    expect(validateRoutineInput(input).error).toBeNull();
  });

  it('keeps a zero load, such as an empty bar', () => {
    const input = toRoutineInput(updateTargets(fromSaved(), ROW_A, { targetKg: '0' }));

    expect(input.exercises[0]?.targetKg).toBe(0);
  });

  it.each(ROUTINE_TEMPLATES.map((template) => [template.slug, template] as const))(
    'copies the %s template into a valid draft with no load targets',
    (_slug, template) => {
      let next = 0;
      const draft = draftFromTemplate(template, OPERATION_ID, () => `key-${(next += 1)}`);
      const input = toRoutineInput(draft);

      expect(draft.title).toBe(template.title);
      expect(draft.exercises).toHaveLength(template.exercises.length);
      expect(new Set(draft.exercises.map((row) => row.key)).size).toBe(draft.exercises.length);
      expect(input.exercises.every((row) => row.targetKg === null)).toBe(true);
      expect(validateRoutineInput(input).error).toBeNull();
    },
  );
});

import { findExerciseBySlug } from '../catalog';
import type { Exercise, RoutineTemplate } from '../catalog';
import type { Routine } from './api';
import { moveItem } from './ordering';
import type { RoutineInput } from './types';

const DEFAULT_TARGETS = { targetSets: '3', targetReps: '10', targetKg: '', restSeconds: '90' };

/** Form fields stay as text so a half-typed number is never rewritten. */
export interface DraftExercise {
  /** Stable across reorders, so each row keeps its focus and typed values. */
  key: string;
  /** The saved row's ID, when there is one. */
  id?: string;
  exerciseId: string;
  targetSets: string;
  targetReps: string;
  targetKg: string;
  restSeconds: string;
}

export type DraftTargets = Pick<
  DraftExercise,
  'targetSets' | 'targetReps' | 'targetKg' | 'restSeconds'
>;

export interface RoutineDraft {
  id?: string;
  title: string;
  exercises: DraftExercise[];
  /** Reused when a create is retried, so it can't make a second routine. */
  operationId: string;
}

export const emptyDraft = (operationId: string): RoutineDraft => ({
  title: '',
  exercises: [],
  operationId,
});

export const draftFromRoutine = (routine: Routine, operationId: string): RoutineDraft => ({
  id: routine.id,
  title: routine.title,
  operationId,
  exercises: routine.exercises.map((exercise) => ({
    key: exercise.id,
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    targetSets: String(exercise.targetSets),
    targetReps: String(exercise.targetReps),
    targetKg: exercise.targetKg === null ? '' : String(exercise.targetKg),
    restSeconds: String(exercise.restSeconds),
  })),
});

export function draftFromTemplate(
  template: RoutineTemplate,
  operationId: string,
  newKey: () => string,
): RoutineDraft {
  const exercises = template.exercises.flatMap((planned) => {
    const exercise = findExerciseBySlug(planned.exerciseSlug);
    if (!exercise) return [];
    return [
      {
        key: newKey(),
        exerciseId: exercise.id,
        targetSets: String(planned.targetSets),
        targetReps: String(planned.targetReps),
        targetKg: '',
        restSeconds: String(planned.restSeconds),
      },
    ];
  });
  return { title: template.title, exercises, operationId };
}

export const addExercise = (
  draft: RoutineDraft,
  exercise: Pick<Exercise, 'id'>,
  key: string,
): RoutineDraft => ({
  ...draft,
  exercises: [...draft.exercises, { key, exerciseId: exercise.id, ...DEFAULT_TARGETS }],
});

export const removeExercise = (draft: RoutineDraft, key: string): RoutineDraft => ({
  ...draft,
  exercises: draft.exercises.filter((exercise) => exercise.key !== key),
});

export const moveExercise = (draft: RoutineDraft, from: number, to: number): RoutineDraft => ({
  ...draft,
  exercises: moveItem(draft.exercises, from, to),
});

export const updateTargets = (
  draft: RoutineDraft,
  key: string,
  patch: Partial<DraftTargets>,
): RoutineDraft => ({
  ...draft,
  exercises: draft.exercises.map((exercise) =>
    exercise.key === key ? { ...exercise, ...patch } : exercise,
  ),
});

/**
 * Puts a different exercise in a row, keeping its sets, reps and rest. The
 * planned load is replaced, never carried over: pass the user's own prior load
 * for the new exercise in kilograms, or null to leave it for them to enter.
 */
export const replaceExercise = (
  draft: RoutineDraft,
  key: string,
  exerciseId: string,
  priorKg: number | null,
): RoutineDraft => ({
  ...draft,
  exercises: draft.exercises.map((exercise) =>
    exercise.key === key
      ? { ...exercise, exerciseId, targetKg: priorKg === null ? '' : String(priorKg) }
      : exercise,
  ),
});

/** Blank must not become 0, which `Number('')` would otherwise accept as valid. */
const toNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value));

/** Converts the form to API input. Validation then reports any bad numbers. */
export const toRoutineInput = (draft: RoutineDraft): RoutineInput => ({
  ...(draft.id ? { id: draft.id } : { operationId: draft.operationId }),
  title: draft.title,
  exercises: draft.exercises.map((exercise) => ({
    ...(exercise.id ? { id: exercise.id } : {}),
    exerciseId: exercise.exerciseId,
    targetSets: toNumber(exercise.targetSets),
    targetReps: toNumber(exercise.targetReps),
    targetKg: exercise.targetKg.trim() === '' ? null : Number(exercise.targetKg),
    restSeconds: toNumber(exercise.restSeconds),
  })),
});

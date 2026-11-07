import { EXERCISE_ALTERNATIVES } from './data/alternatives';
import { EXERCISES } from './data/exercises';
import type {
  AlternativeKind,
  Equipment,
  Exercise,
  ExerciseAlternative,
  MovementPattern,
  Muscle,
} from './types';

export interface ExerciseFilters {
  /** Matches any part of the name, ignoring case. */
  search?: string;
  pattern?: MovementPattern;
  equipment?: Equipment;
  muscle?: Muscle;
}

export interface AlternativeOption extends ExerciseAlternative {
  exercise: Exercise;
}

const byId = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));
const bySlug = new Map(EXERCISES.map((exercise) => [exercise.slug, exercise]));

export const findExerciseById = (id: string): Exercise | undefined => byId.get(id);

export const findExerciseBySlug = (slug: string): Exercise | undefined => bySlug.get(slug);

export function filterExercises(filters: ExerciseFilters = {}): Exercise[] {
  const search = filters.search?.trim().toLowerCase();
  const { muscle } = filters;

  return EXERCISES.filter(
    (exercise) =>
      (!search || exercise.name.toLowerCase().includes(search)) &&
      (!filters.pattern || exercise.pattern === filters.pattern) &&
      (!filters.equipment || exercise.equipment === filters.equipment) &&
      (!muscle ||
        exercise.primaryMuscles.includes(muscle) ||
        exercise.secondaryMuscles.includes(muscle)),
  );
}

/** Curated options for an exercise in display order, optionally for one equipment type. */
export function findAlternatives(
  exerciseId: string,
  kind: AlternativeKind,
  equipment?: Equipment,
): AlternativeOption[] {
  return EXERCISE_ALTERNATIVES.filter(
    (alternative) => alternative.sourceExerciseId === exerciseId && alternative.kind === kind,
  )
    .flatMap((alternative) => {
      const exercise = byId.get(alternative.targetExerciseId);
      return exercise ? [{ ...alternative, exercise }] : [];
    })
    .filter((option) => !equipment || option.exercise.equipment === equipment)
    .sort((a, b) => a.position - b.position);
}

/** Equipment worth offering as filter chips, so no chip leads to an empty list. */
export function alternativeEquipment(exerciseId: string, kind: AlternativeKind): Equipment[] {
  return [...new Set(findAlternatives(exerciseId, kind).map((option) => option.exercise.equipment))];
}

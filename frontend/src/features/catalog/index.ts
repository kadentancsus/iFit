export { EXERCISE_ALTERNATIVES } from './data/alternatives';
export { EXERCISES } from './data/exercises';
export { ROUTINE_TEMPLATES } from './data/templates';
export type { RoutineTemplate, RoutineTemplateExercise } from './data/templates';
export { STOP_IF_PAIN } from './guidance';
export {
  alternativeEquipment,
  filterExercises,
  findAlternatives,
  findExerciseById,
  findExerciseBySlug,
} from './queries';
export type { AlternativeOption, ExerciseFilters } from './queries';
export * from './types';

/**
 * Exercise catalog domain types.
 *
 * The string unions below are mirrored by CHECK constraints in
 * `supabase/migrations/0002_planning.sql`; change both together.
 */

export const MOVEMENT_PATTERNS = ['push', 'pull', 'squat', 'hinge', 'core'] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT_TYPES)[number];

/**
 * What a logged weight means for an exercise. Numbers are only comparable
 * within one convention, which is why loads never transfer between them.
 *
 * - `total`: everything on one implement (a barbell with plates, or the single
 *   dumbbell held for a goblet squat).
 * - `per_dumbbell`: the weight of each dumbbell, not the pair.
 * - `machine`: the number on a stack or plate-loaded machine, including cables.
 *   Pulleys and levers differ, so it is not a free-weight equivalent.
 * - `bodyweight`: reps only, no external load.
 */
export const LOAD_CONVENTIONS = ['total', 'per_dumbbell', 'machine', 'bodyweight'] as const;
export type LoadConvention = (typeof LOAD_CONVENTIONS)[number];

export const ALTERNATIVE_KINDS = ['substitution', 'regression'] as const;
export type AlternativeKind = (typeof ALTERNATIVE_KINDS)[number];

export const MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'lats',
  'upper back',
  'biceps',
  'quads',
  'glutes',
  'hamstrings',
  'core',
  'lower back',
] as const;
export type Muscle = (typeof MUSCLES)[number];

/** 1 = easiest to set up and control, 3 = most technique demand. */
export type Difficulty = 1 | 2 | 3;

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  pattern: MovementPattern;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  equipment: Equipment;
  loadConvention: LoadConvention;
  difficulty: Difficulty;
  summary: string;
  instructions: readonly string[];
  /** Exactly three, short enough to read between sets. */
  cues: readonly [string, string, string];
  mistakes: readonly string[];
  /** Static two-phase diagram. Use this one for `prefers-reduced-motion`. */
  assetPath: string;
  /** Looping demonstration of the same movement. */
  motionAssetPath: string;
  assetAlt: string;
}

export interface ExerciseAlternative {
  sourceExerciseId: string;
  targetExerciseId: string;
  kind: AlternativeKind;
  /** Shown to the user as the reason for the suggestion. */
  rationale: string;
  /** Curated display order within one source and kind, starting at 0. */
  position: number;
}

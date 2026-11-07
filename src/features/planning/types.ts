/**
 * Routine and schedule domain types. Limits match the CHECK constraints in
 * `supabase/migrations/0002_planning.sql`; change both together.
 */

export const ROUTINE_LIMITS = {
  titleLength: 80,
  exercises: 30,
  sets: 20,
  reps: 100,
  kg: 1000,
  restSeconds: 600,
} as const;

/** There is intentionally no `missed` status: unfinished plans are not judged. */
export const SCHEDULE_STATUSES = ['planned', 'completed', 'canceled'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export interface RoutineExerciseInput {
  /** Present when editing a row that already exists. */
  id?: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  /** Canonical kilograms. Null means no planned load. */
  targetKg: number | null;
  restSeconds: number;
}

export interface RoutineInput {
  /** Present when editing a routine that already exists. */
  id?: string;
  title: string;
  /** Array order is the routine order. */
  exercises: RoutineExerciseInput[];
  operationId?: string;
}

export interface ScheduleInput {
  routineId: string;
  /** The user's calendar date as `YYYY-MM-DD`. */
  localDate: string;
  operationId?: string;
}

export interface RescheduleInput {
  id: string;
  localDate: string;
}

export type PlanningErrorCode =
  | 'invalid_input'
  | 'invalid_id'
  | 'invalid_title'
  | 'invalid_target'
  | 'invalid_date'
  | 'date_in_past'
  | 'unknown_exercise'
  | 'load_not_applicable'
  | 'too_many_exercises'
  | 'duplicate_entry';

export interface PlanningError {
  code: PlanningErrorCode;
  /** Safe to show to the user. */
  message: string;
  /** Dotted path to the failing input, such as `exercises.0.targetReps`. */
  field?: string;
}

export type PlanningResult<T> = { data: T; error: null } | { data: null; error: PlanningError };

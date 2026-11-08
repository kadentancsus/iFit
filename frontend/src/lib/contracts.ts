/**
 * Shared API contracts for every lane.
 *
 * Mirrors the Pydantic models in `backend/app/contracts`. The `as const`
 * arrays and `API_ROUTES` are checked against Python by
 * `backend/tests/contracts/test_frontend_parity.py`, so keep the
 * `export const NAME = [...] as const;` and `name: { method, path }` layouts.
 *
 * Conventions: IDs are UUID strings, timestamps are UTC ISO strings, calendar
 * dates are the user's local `YYYY-MM-DD`, and every weight is canonical kg.
 */
import type { ExerciseFilters as CatalogExerciseFilters } from '@/features/catalog/queries';
import type { Exercise as CatalogExercise } from '@/features/catalog/types';
import type {
  RescheduleInput,
  RoutineExerciseInput,
  RoutineInput,
  ScheduleInput,
} from '@/features/planning/types';
import type {
  LogSetInput,
  RestState,
  SessionExercise,
  SetLog,
  SetValues,
  StartWorkoutInput,
  Targets,
  WorkoutSession,
} from '@/features/workout/types';

export type {
  LogSetInput,
  RescheduleInput,
  RestState,
  RoutineExerciseInput,
  RoutineInput,
  ScheduleInput,
  SessionExercise,
  SetLog,
  StartWorkoutInput,
  Targets,
  WorkoutSession,
};

// ---------------------------------------------------------------------------
// Shared value sets
// ---------------------------------------------------------------------------

export const DISPLAY_UNITS = ['kg', 'lb'] as const;
export type DisplayUnit = (typeof DISPLAY_UNITS)[number];

export const LOAD_CONVENTIONS = ['total', 'per_dumbbell', 'machine', 'bodyweight'] as const;
export type LoadConvention = (typeof LOAD_CONVENTIONS)[number];

export const LOAD_MODES = ['weighted', 'bodyweight'] as const;
export type LoadMode = (typeof LOAD_MODES)[number];

export const SESSION_STATUSES = ['active', 'completed', 'stopped'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** There is intentionally no `missed` status: unfinished plans are not judged. */
export const SCHEDULE_STATUSES = ['planned', 'completed', 'canceled'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const ALTERNATIVE_KINDS = ['substitution', 'regression'] as const;
export type AlternativeKind = (typeof ALTERNATIVE_KINDS)[number];

export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT_TYPES)[number];

export const MOVEMENT_PATTERNS = ['push', 'pull', 'squat', 'hinge', 'core'] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

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

// ---------------------------------------------------------------------------
// The { data, error } result
// ---------------------------------------------------------------------------

/** Every stable `error.code` the API returns, plus client-only codes. */
export const ERROR_CODES = [
  'bad_request',
  'invalid_input',
  'not_authenticated',
  'invalid_session',
  'auth_unavailable',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'payload_too_large',
  'rate_limited',
  'request_failed',
  'internal_error',
  'invalid_id',
  'invalid_title',
  'invalid_target',
  'invalid_date',
  'date_in_past',
  'unknown_exercise',
  'load_not_applicable',
  'too_many_exercises',
  'duplicate_entry',
  'session_closed',
  'active_session_exists',
  'conflict',
] as const;

/** Produced by the browser, never by the API. */
export const CLIENT_ERROR_CODES = ['network_error', 'bad_response'] as const;

export type ErrorCode =
  | (typeof ERROR_CODES)[number]
  | (typeof CLIENT_ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  /** Safe to show to the user. */
  message: string;
  /** Dotted path to the failing input, such as `exercises.0.targetReps`. */
  field?: string | null;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiErrorBody };

// ---------------------------------------------------------------------------
// Identity, profile and dashboard (Kaden)
// ---------------------------------------------------------------------------

export interface SessionInfo {
  userId: string;
  email: string | null;
}

export interface Profile {
  userId: string;
  displayName: string;
  displayUnit: DisplayUnit;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** Send only the fields that change; none may be null. */
export type ProfileUpdate = Partial<Pick<Profile, 'displayName' | 'displayUnit' | 'timezone'>>;

export interface ActiveWorkoutRef {
  id: string;
  routineNameSnapshot: string;
  startedAt: string;
}

export interface ProgressSummary {
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  setsLast7Days: number;
}

export interface Dashboard {
  profile: Profile;
  /** Today in the profile's time zone. */
  today: string;
  todaysWorkouts: ScheduledWorkout[];
  upcomingWorkouts: ScheduledWorkout[];
  activeWorkout: ActiveWorkoutRef | null;
  recentSessions: WorkoutSummary[];
  progress: ProgressSummary;
}

// ---------------------------------------------------------------------------
// Catalog (Sukhdip)
// ---------------------------------------------------------------------------

export type Exercise = CatalogExercise;
export type ExerciseFilters = CatalogExerciseFilters;

/** The user's most recent set of one exact exercise, used to prefill. */
export type LastPerformance = SetValues & { completedAt: string };

export interface AlternativeOption {
  kind: AlternativeKind;
  /** Shown to the user as the reason for the suggestion. */
  rationale: string;
  position: number;
  exercise: Exercise;
  /** The user's own prior result for this alternative, if any. */
  lastPerformance: LastPerformance | null;
}

// ---------------------------------------------------------------------------
// Routines and schedule (Sukhdip)
// ---------------------------------------------------------------------------

export interface RoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  exerciseName: string;
  loadConvention: LoadConvention;
  position: number;
  targetSets: number;
  targetReps: number;
  /** Canonical kilograms; null means no planned load. */
  targetKg: number | null;
  restSeconds: number;
}

export interface RoutineSummary {
  id: string;
  title: string;
  exerciseCount: number;
  updatedAt: string;
}

export interface Routine {
  id: string;
  ownerId: string;
  title: string;
  exercises: RoutineExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledWorkout {
  id: string;
  ownerId: string;
  routineId: string;
  routineTitle: string;
  localDate: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

/** Inclusive local dates. */
export interface ScheduleRange {
  fromDate: string;
  toDate: string;
}

// ---------------------------------------------------------------------------
// Workouts, history and progress (Sina)
// ---------------------------------------------------------------------------

export interface WorkoutExercise {
  entry: SessionExercise;
  sets: SetLog[];
  lastPerformance: LastPerformance | null;
}

export interface WorkoutDetail {
  session: WorkoutSession;
  /** In position order. Replaced entries stay, linked by `replacedEntryId`. */
  exercises: WorkoutExercise[];
}

export type UpdateSetInput = SetValues;

export interface SwapExerciseInput {
  sessionExerciseId: string;
  replacementExerciseId: string;
  /** Sets still to do move to the replacement; logged sets stay put. */
  remainingTargets: Targets;
  operationId: string;
}

export interface SwapResult {
  replaced: SessionExercise;
  replacement: SessionExercise;
}

export interface FinishWorkoutInput {
  operationId: string;
}

export interface WorkoutSummary {
  id: string;
  routineNameSnapshot: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  exerciseCount: number;
  setCount: number;
  /** Reps x kg over weighted sets only; null when there are none. */
  weightedVolumeKg: number | null;
}

export interface ProgressPoint {
  sessionId: string;
  localDate: string;
  bestReps: number;
  bestWeightKg: number | null;
  weightedVolumeKg: number | null;
}

export interface ExerciseProgress {
  exerciseId: string;
  exerciseName: string;
  loadConvention: LoadConvention;
  points: ProgressPoint[];
}

// ---------------------------------------------------------------------------
// REST paths, relative to /api/v1. Same table as backend/app/contracts/operations.py.
// ---------------------------------------------------------------------------

export const API_ROUTES = {
  getSession: { method: 'GET', path: '/session' },
  getDashboard: { method: 'GET', path: '/dashboard' },
  getProfile: { method: 'GET', path: '/profile' },
  updateProfile: { method: 'PATCH', path: '/profile' },
  listExercises: { method: 'GET', path: '/exercises' },
  getExercise: { method: 'GET', path: '/exercises/{exerciseId}' },
  getAlternatives: { method: 'GET', path: '/exercises/{exerciseId}/alternatives' },
  listRoutines: { method: 'GET', path: '/routines' },
  getRoutine: { method: 'GET', path: '/routines/{routineId}' },
  createRoutine: { method: 'POST', path: '/routines' },
  updateRoutine: { method: 'PUT', path: '/routines/{routineId}' },
  deleteRoutine: { method: 'DELETE', path: '/routines/{routineId}' },
  listScheduledWorkouts: { method: 'GET', path: '/schedule' },
  scheduleRoutine: { method: 'POST', path: '/schedule' },
  rescheduleWorkout: { method: 'PATCH', path: '/schedule/{scheduleId}' },
  cancelScheduledWorkout: { method: 'POST', path: '/schedule/{scheduleId}/cancel' },
  startWorkout: { method: 'POST', path: '/workouts' },
  getActiveWorkout: { method: 'GET', path: '/workouts/active' },
  getWorkout: { method: 'GET', path: '/workouts/{sessionId}' },
  logSet: { method: 'POST', path: '/sets' },
  updateSet: { method: 'PATCH', path: '/sets/{setId}' },
  deleteSet: { method: 'DELETE', path: '/sets/{setId}' },
  swapExercise: { method: 'POST', path: '/swaps' },
  saveRestState: { method: 'PUT', path: '/workouts/{sessionId}/rest' },
  finishWorkout: { method: 'POST', path: '/workouts/{sessionId}/finish' },
  listHistory: { method: 'GET', path: '/history' },
  getProgress: { method: 'GET', path: '/progress/{exerciseId}' },
} as const;

export type OperationName = keyof typeof API_ROUTES;
export type HttpMethod = (typeof API_ROUTES)[OperationName]['method'];

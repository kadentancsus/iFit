/** Lane-owned domain types; Python validates requests authoritatively. */
export const WORKOUT_LIMITS = { sets: 20, reps: 100, kg: 1000, restSeconds: 600 } as const;
export type LoadMode = 'weighted' | 'bodyweight';
export type SessionStatus = 'active' | 'completed' | 'stopped';
export type LoadConvention = 'total' | 'per_dumbbell' | 'machine' | 'bodyweight';

export interface Targets {
  targetSets: number;
  targetReps: number;
  targetKg: number | null;
  restSeconds: number;
}

export interface StartWorkoutInput {
  routineId: string;
  scheduleId?: string | null;
  operationId: string;
}

export type SetValues =
  | { reps: number; weightKg: number; loadMode: 'weighted' }
  | { reps: number; weightKg: null; loadMode: 'bodyweight' };
export type LogSetInput = SetValues & { sessionExerciseId: string; operationId: string };
export type SetLog = LogSetInput & {
  id: string;
  ordinal: number;
  isDeleted: boolean;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Running deadlines survive refresh; paused remainders do not tick. */
export type RestState =
  | { status: 'running'; endsAt: string; remainingSeconds: 0 }
  | { status: 'paused'; endsAt: null; remainingSeconds: number }
  | { status: 'idle'; endsAt: null; remainingSeconds: 0 };

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  loadConventionSnapshot: LoadConvention;
  position: number;
  targets: Targets;
  replacedEntryId: string | null;
  isReplaced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutSession {
  id: string;
  ownerId: string;
  routineId: string | null;
  scheduleId: string | null;
  routineNameSnapshot: string;
  operationId: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  restState: RestState;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutError {
  code: 'invalid_input' | 'session_closed' | 'load_not_applicable';
  message: string;
  field?: string;
}
export type WorkoutResult<T> = { data: T; error: null } | { data: null; error: WorkoutError };
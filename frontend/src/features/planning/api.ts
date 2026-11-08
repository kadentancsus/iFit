import type { Equipment, LoadConvention } from '../catalog';
import { getAccessToken } from './access-token';
import type { RoutineInput, ScheduleInput, ScheduleStatus } from './types';

export interface ApiError {
  code: string;
  /** Safe to show to the user. */
  message: string;
  /** Dotted path to the failing input, such as `exercises.0.targetReps`. */
  field?: string | null;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

export interface RoutineSummary {
  id: string;
  title: string;
  exerciseCount: number;
  updatedAt: string;
}

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  equipment: Equipment;
  loadConvention: LoadConvention;
  position: number;
  targetSets: number;
  targetReps: number;
  /** Canonical kilograms. Null means no planned load. */
  targetKg: number | null;
  restSeconds: number;
}

export interface Routine {
  id: string;
  title: string;
  updatedAt: string;
  /** In routine order. */
  exercises: RoutineExercise[];
}

export interface ScheduledWorkout {
  id: string;
  /** Null once the routine has been deleted. */
  routineId: string | null;
  /** The routine's current name, or its last name if it was deleted. */
  routineTitle: string;
  localDate: string;
  status: ScheduleStatus;
}

interface ApiOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

const failure = (code: string, message: string): { data: null; error: ApiError } => ({
  data: null,
  error: { code, message },
});

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/** Sends one request to the iFit API and always resolves to `{ data, error }`. */
export function createApiRequest({ baseUrl, getToken, fetcher }: ApiOptions) {
  const send = fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  return async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    { signedIn = true, init = {} }: { signedIn?: boolean; init?: RequestInit } = {},
  ): Promise<ApiResult<T>> {
    const token = signedIn ? await getToken() : null;
    if (signedIn && !token) return failure('not_authenticated', 'Please sign in to continue.');

    let response: Response;
    try {
      response = await send(`${baseUrl}/api/v1${path}`, {
        ...init,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return failure(
        'network_error',
        "We couldn't reach iFit. Check your connection and try again.",
      );
    }

    try {
      return (await response.json()) as ApiResult<T>;
    } catch {
      return failure('request_failed', 'Something went wrong. Please try again.');
    }
  };
}

const path = (id: string) => encodeURIComponent(id);

export function createRoutinesApi(options: ApiOptions) {
  const request = createApiRequest(options);
  return {
    listRoutines: () => request<RoutineSummary[]>('GET', '/routines'),
    getRoutine: (id: string) => request<Routine>('GET', `/routines/${path(id)}`),
    /** Creates the routine, or updates it when the input has an ID. */
    saveRoutine: (input: RoutineInput) =>
      input.id
        ? request<Routine>('PUT', `/routines/${path(input.id)}`, input)
        : request<Routine>('POST', '/routines', input),
    deleteRoutine: (id: string) => request<{ id: string }>('DELETE', `/routines/${path(id)}`),
  };
}

export function createScheduleApi(options: ApiOptions) {
  const request = createApiRequest(options);

  return {
    listSchedule: (range: { from?: string; to?: string } = {}) => {
      const query = new URLSearchParams(
        Object.entries(range).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ).toString();
      return request<ScheduledWorkout[]>('GET', `/schedule${query ? `?${query}` : ''}`);
    },
    scheduleRoutine: (input: ScheduleInput) =>
      request<ScheduledWorkout>('POST', '/schedule', input),
    rescheduleWorkout: (id: string, localDate: string) =>
      request<ScheduledWorkout>('PATCH', `/schedule/${path(id)}`, { localDate }),
    cancelScheduledWorkout: (id: string) =>
      request<ScheduledWorkout>('POST', `/schedule/${path(id)}/cancel`),
  };
}

const signedIn = { baseUrl: API_BASE_URL, getToken: getAccessToken };

export const routinesApi = createRoutinesApi(signedIn);
export const scheduleApi = createScheduleApi(signedIn);

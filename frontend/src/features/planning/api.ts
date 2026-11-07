import type { Equipment, LoadConvention } from '../catalog';
import { getAccessToken } from './access-token';
import type { RoutineInput } from './types';

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

interface ApiOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

const failure = (code: string, message: string): { data: null; error: ApiError } => ({
  data: null,
  error: { code, message },
});

export function createRoutinesApi({ baseUrl, getToken, fetcher }: ApiOptions) {
  const send = fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const token = await getToken();
    if (!token) return failure('not_authenticated', 'Please sign in to continue.');

    let response: Response;
    try {
      response = await send(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
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
  }

  return {
    listRoutines: () => request<RoutineSummary[]>('GET', '/routines'),
    getRoutine: (id: string) => request<Routine>('GET', `/routines/${encodeURIComponent(id)}`),
    /** Creates the routine, or updates it when the input has an ID. */
    saveRoutine: (input: RoutineInput) =>
      input.id
        ? request<Routine>('PUT', `/routines/${encodeURIComponent(input.id)}`, input)
        : request<Routine>('POST', '/routines', input),
    deleteRoutine: (id: string) =>
      request<{ id: string }>('DELETE', `/routines/${encodeURIComponent(id)}`),
  };
}

export const routinesApi = createRoutinesApi({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  getToken: getAccessToken,
});

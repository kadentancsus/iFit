/**
 * Planning calls through the shared `callApi`, typed by the shared contracts.
 * The token getter is passed in so sign-in can supply a fresh token per call.
 */
import { callApi } from '@/lib/api';
import type {
  ApiErrorBody,
  ApiResult,
  Routine,
  RoutineInput,
  RoutineSummary,
  ScheduleInput,
  ScheduledWorkout,
} from '@/lib/contracts';

import { getAccessToken } from './access-token';

export type { ApiResult, Routine, RoutineSummary, ScheduledWorkout };
export type ApiError = ApiErrorBody;

const SIGN_IN: ApiResult<never> = {
  data: null,
  error: { code: 'not_authenticated', message: 'Please sign in to continue.' },
};

export function planningApi(
  getToken: () => Promise<string | null> = getAccessToken,
  fetcher?: typeof fetch,
) {
  /** Skips the request entirely when nobody is signed in. */
  async function signedIn<T>(
    call: (accessToken: string) => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    const accessToken = await getToken();
    return accessToken ? call(accessToken) : SIGN_IN;
  }

  return {
    listRoutines: () =>
      signedIn((accessToken) =>
        callApi<RoutineSummary[]>('listRoutines', { accessToken, fetch: fetcher }),
      ),
    getRoutine: (routineId: string) =>
      signedIn((accessToken) =>
        callApi<Routine>('getRoutine', { accessToken, params: { routineId }, fetch: fetcher }),
      ),
    /** Creates the routine, or updates it when the input has an ID. */
    saveRoutine: (body: RoutineInput) =>
      signedIn((accessToken) =>
        body.id
          ? callApi<Routine>('updateRoutine', {
              accessToken,
              params: { routineId: body.id },
              body,
              fetch: fetcher,
            })
          : callApi<Routine>('createRoutine', { accessToken, body, fetch: fetcher }),
      ),
    deleteRoutine: (routineId: string) =>
      signedIn((accessToken) =>
        callApi<{ id: string }>('deleteRoutine', {
          accessToken,
          params: { routineId },
          fetch: fetcher,
        }),
      ),
    listScheduledWorkouts: (range: { fromDate?: string; toDate?: string } = {}) =>
      signedIn((accessToken) =>
        callApi<ScheduledWorkout[]>('listScheduledWorkouts', {
          accessToken,
          query: { ...range },
          fetch: fetcher,
        }),
      ),
    scheduleRoutine: (body: ScheduleInput) =>
      signedIn((accessToken) =>
        callApi<ScheduledWorkout>('scheduleRoutine', { accessToken, body, fetch: fetcher }),
      ),
    rescheduleWorkout: (scheduleId: string, localDate: string) =>
      signedIn((accessToken) =>
        callApi<ScheduledWorkout>('rescheduleWorkout', {
          accessToken,
          params: { scheduleId },
          body: { localDate },
          fetch: fetcher,
        }),
      ),
    cancelScheduledWorkout: (scheduleId: string) =>
      signedIn((accessToken) =>
        callApi<ScheduledWorkout>('cancelScheduledWorkout', {
          accessToken,
          params: { scheduleId },
          fetch: fetcher,
        }),
      ),
  };
}

export const routinesApi = planningApi();
export const scheduleApi = routinesApi;

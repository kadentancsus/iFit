import { callApi } from '@/lib/api';
import type { LogSetInput, SetLog, StartWorkoutInput, WorkoutDetail } from '@/lib/contracts';

/** Auth supplies the current token at call time, including after token refresh. */
export function workoutApi(getAccessToken: () => Promise<string | null>) {
  return {
    async startWorkout(body: StartWorkoutInput) {
      return callApi<WorkoutDetail>('startWorkout', { accessToken: await getAccessToken(), body });
    },
    async getActiveWorkout() {
      return callApi<WorkoutDetail | null>('getActiveWorkout', { accessToken: await getAccessToken() });
    },
    async getWorkout(sessionId: string) {
      return callApi<WorkoutDetail>('getWorkout', {
        accessToken: await getAccessToken(), params: { sessionId },
      });
    },
    async logSet(body: LogSetInput) {
      return callApi<SetLog>('logSet', { accessToken: await getAccessToken(), body });
    },
  };
}

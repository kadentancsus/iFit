import { callApi } from '@/lib/api';
import type {
  AlternativeKind,
  AlternativeOption,
  ApiResult,
  Equipment,
  Exercise,
  ExerciseFilters,
} from '@/lib/contracts';

/** The catalog is public, so these calls never send a sign-in token. */
export function catalogApi(fetcher?: typeof fetch) {
  return {
    listExercises: (filters: ExerciseFilters = {}): Promise<ApiResult<Exercise[]>> =>
      callApi('listExercises', { query: { ...filters }, fetch: fetcher }),
    /** Accepts the exercise ID or its slug. */
    getExercise: (exerciseId: string): Promise<ApiResult<Exercise>> =>
      callApi('getExercise', { params: { exerciseId }, fetch: fetcher }),
    /**
     * Public, but a signed-in caller's token adds their own last result for
     * each option, which is the only load the app may prefill.
     */
    getAlternatives: (
      exerciseId: string,
      kind: AlternativeKind,
      { equipment, accessToken }: { equipment?: Equipment; accessToken?: string | null } = {},
    ): Promise<ApiResult<AlternativeOption[]>> =>
      callApi('getAlternatives', {
        params: { exerciseId },
        query: { kind, equipment },
        accessToken,
        fetch: fetcher,
      }),
  };
}

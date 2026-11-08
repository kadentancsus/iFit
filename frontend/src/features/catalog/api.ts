import { callApi } from '@/lib/api';
import type { ApiResult, Exercise, ExerciseFilters } from '@/lib/contracts';

/** The catalog is public, so these calls never send a sign-in token. */
export function catalogApi(fetcher?: typeof fetch) {
  return {
    listExercises: (filters: ExerciseFilters = {}): Promise<ApiResult<Exercise[]>> =>
      callApi('listExercises', { query: { ...filters }, fetch: fetcher }),
    /** Accepts the exercise ID or its slug. */
    getExercise: (exerciseId: string): Promise<ApiResult<Exercise>> =>
      callApi('getExercise', { params: { exerciseId }, fetch: fetcher }),
  };
}

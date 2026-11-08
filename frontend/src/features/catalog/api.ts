import { API_BASE_URL, createApiRequest } from '../planning/api';
import type { ApiResult } from '../planning/api';
import type { Equipment, Exercise, MovementPattern, Muscle } from './types';

/** A catalog entry without its instructions, as listed by the API. */
export type ExerciseSummary = Omit<Exercise, 'instructions' | 'cues' | 'mistakes' | 'motionAssetPath'>;

export interface CatalogFilters {
  search?: string;
  pattern?: MovementPattern;
  equipment?: Equipment;
  muscle?: Muscle;
}

/** The catalog is public, so these requests never send a sign-in token. */
export function createCatalogApi(options: { baseUrl: string; fetcher?: typeof fetch }) {
  const request = createApiRequest({ ...options, getToken: async () => null });
  // Always read fresh so a reseeded catalog shows up without a rebuild.
  const fresh = { signedIn: false, init: { cache: 'no-store' as const } };

  return {
    listExercises: (filters: CatalogFilters = {}): Promise<ApiResult<ExerciseSummary[]>> => {
      const query = new URLSearchParams(
        Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
      ).toString();
      return request('GET', `/exercises${query ? `?${query}` : ''}`, undefined, fresh);
    },
    getExercise: (idOrSlug: string): Promise<ApiResult<Exercise>> =>
      request('GET', `/exercises/${encodeURIComponent(idOrSlug)}`, undefined, fresh),
  };
}

export const catalogApi = createCatalogApi({ baseUrl: API_BASE_URL });

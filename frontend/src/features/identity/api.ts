/** Profile and dashboard calls through the shared `callApi`. */
import { callApi } from '@/lib/api';
import type { ApiResult, Dashboard, Profile, ProfileUpdate } from '@/lib/contracts';
import { getAccessToken } from '@/lib/supabase/client';

const SIGN_IN: ApiResult<never> = {
  data: null,
  error: { code: 'not_authenticated', message: 'Please sign in to continue.' },
};

export function identityApi(
  getToken: () => Promise<string | null> = getAccessToken,
  fetcher?: typeof fetch,
) {
  async function signedIn<T>(
    call: (accessToken: string) => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    const accessToken = await getToken();
    return accessToken ? call(accessToken) : SIGN_IN;
  }

  return {
    getProfile: () =>
      signedIn((accessToken) => callApi<Profile>('getProfile', { accessToken, fetch: fetcher })),
    updateProfile: (body: ProfileUpdate) =>
      signedIn((accessToken) =>
        callApi<Profile>('updateProfile', { accessToken, body, fetch: fetcher }),
      ),
    getDashboard: () =>
      signedIn((accessToken) =>
        callApi<Dashboard>('getDashboard', { accessToken, fetch: fetcher }),
      ),
  };
}

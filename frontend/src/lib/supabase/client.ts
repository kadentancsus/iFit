/**
 * The browser's Supabase client. Used only for signing in, signing up and
 * signing out; all personal data goes through the FastAPI backend.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseEnv } from './env';

let client: SupabaseClient | undefined;

export function browserSupabase(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = supabaseEnv();
    client = createBrowserClient(url, publishableKey);
  }
  return client;
}

/**
 * The signed-in user's current access token for `Authorization: Bearer`, or
 * null when signed out. Refreshes an expiring token first. Pass this to feature
 * API wrappers (e.g. `workoutApi(getAccessToken)`); the backend verifies it.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await browserSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

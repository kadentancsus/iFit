/**
 * Supabase on the Next.js server: who is signed in for this request.
 * A new client is created for every request; never share one between users.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { loginPath } from '@/lib/auth/routes';

import { supabaseEnv } from './env';

export interface SignedInUser {
  id: string;
  email: string | null;
}

export async function serverSupabase() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/**
 * The verified user for this request, or null. `getClaims` checks the token's
 * signature and expiry; the unverified session cookie is never trusted alone.
 */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
});

/** For protected pages: the signed-in user, or a redirect to sign-in that comes back here. */
export async function requireUser(returnTo: string): Promise<SignedInUser> {
  const user = await getSignedInUser();
  if (!user) redirect(loginPath(returnTo));
  return user;
}

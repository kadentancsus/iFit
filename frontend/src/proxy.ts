/**
 * Runs before every page: refreshes the Supabase session cookie and keeps
 * signed-out visitors on the sign-in pages. Protected pages also check the
 * user themselves (requireUser), so this is not the only gate, and the API
 * verifies every token independently.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { routeDecision } from '@/lib/auth/routes';
import { SupabaseConfigError, supabaseEnv } from '@/lib/supabase/env';

export async function proxy(request: NextRequest) {
  let env;
  try {
    env = supabaseEnv();
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) throw error;
    console.error(error.message);
    return new NextResponse(error.message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // Refreshed tokens go to both this request (for the page) and the browser.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Verifies the token signature and expiry, refreshing it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search, searchParams } = request.nextUrl;
  const decision = routeDecision(pathname, search, signedIn, searchParams.get('next'));
  if (decision.type === 'continue') return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  // Keep any refreshed session cookies and no-cache headers on the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const value = response.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

export const config = {
  // Pages only: skip Next.js internals, exercise diagrams and any file with an extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|exercises/|.*\\.[a-zA-Z0-9]+$).*)'],
};

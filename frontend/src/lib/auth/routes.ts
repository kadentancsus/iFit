/**
 * Which pages need a signed-in user, and where people are sent instead.
 * Every page is private unless listed here.
 */

/** Sign-in and sign-up: signed-in users are sent on to the app. */
export const AUTH_PAGES = ['/login', '/signup'] as const;

/** Reachable without signing in. */
export const PUBLIC_PATHS = [...AUTH_PAGES, '/auth/confirm'] as const;

export const HOME_PATH = '/';

const matches = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => matches(pathname, path));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((path) => matches(pathname, path));
}

/**
 * A `next=` value that is safe to redirect to: a path on this site only.
 * Rejects other sites (`//evil.test`, `https://…`, `/\evil.test`) and loops
 * back to the sign-in pages, falling back to home.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return HOME_PATH;
  }
  // Control characters can smuggle a second slash past the checks above.
  if (/[\u0000-\u001f\u007f]/.test(value)) return HOME_PATH;
  try {
    const url = new URL(value, 'http://ifit.local');
    if (url.origin !== 'http://ifit.local' || isPublicPath(url.pathname)) return HOME_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return HOME_PATH;
  }
}

/** `/login?next=…`, omitting `next` when it is just home. */
export function loginPath(returnTo?: string | null): string {
  const next = safeNextPath(returnTo);
  return next === HOME_PATH ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

export type RouteDecision = { type: 'continue' } | { type: 'redirect'; to: string };

/** What the proxy does with a page request. */
export function routeDecision(
  pathname: string,
  search: string,
  signedIn: boolean,
  nextParam: string | null = null,
): RouteDecision {
  if (signedIn && isAuthPage(pathname)) {
    return { type: 'redirect', to: safeNextPath(nextParam) };
  }
  if (!signedIn && !isPublicPath(pathname)) {
    return { type: 'redirect', to: loginPath(`${pathname}${search}`) };
  }
  return { type: 'continue' };
}

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CookieWrite = { name: string; value: string; options: Record<string, unknown> };

/** What the fake Supabase does when the proxy asks for the user. */
const fake = vi.hoisted(() => ({
  sub: null as string | null,
  refreshed: [] as CookieWrite[],
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: { setAll: (cookies: CookieWrite[], headers: Record<string, string>) => void };
    },
  ) => ({
    auth: {
      async getClaims() {
        if (fake.refreshed.length) {
          options.cookies.setAll(fake.refreshed, { 'Cache-Control': 'private, no-store' });
        }
        return fake.sub
          ? { data: { claims: { sub: fake.sub } }, error: null }
          : { data: null, error: null };
      },
    },
  }),
}));

const { proxy, config } = await import('./proxy');

const request = (path: string) => new NextRequest(new URL(path, 'http://localhost:3000'));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  fake.sub = null;
  fake.refreshed = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('sends a signed-out visitor to sign in and remembers the page', async () => {
    const response = await proxy(request('/routines/abc?x=1'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Froutines%2Fabc%3Fx%3D1',
    );
  });

  it('lets a signed-out visitor open the sign-in page', async () => {
    const response = await proxy(request('/login'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets a signed-in user through and sends them away from sign-in', async () => {
    fake.sub = 'user-1';
    expect((await proxy(request('/history'))).headers.get('x-middleware-next')).toBe('1');
    const response = await proxy(request('/login?next=%2Fhistory'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/history');
  });

  it('never redirects a signed-in user to another site', async () => {
    fake.sub = 'user-1';
    const response = await proxy(request('/login?next=%2F%2Fevil.test'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('keeps refreshed session cookies and no-cache headers, even on a redirect', async () => {
    fake.refreshed = [{ name: 'sb-test-auth-token', value: 'fresh', options: { path: '/' } }];
    fake.sub = 'user-1';
    const through = await proxy(request('/profile'));
    expect(through.cookies.get('sb-test-auth-token')?.value).toBe('fresh');
    expect(through.headers.get('cache-control')).toBe('private, no-store');

    const redirected = await proxy(request('/login'));
    expect(redirected.headers.get('location')).toBe('http://localhost:3000/');
    expect(redirected.cookies.get('sb-test-auth-token')?.value).toBe('fresh');
    expect(redirected.headers.get('cache-control')).toBe('private, no-store');
  });

  it('explains missing settings instead of failing obscurely', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await proxy(request('/'));
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/NEXT_PUBLIC_SUPABASE_URL is missing/);
  });

  it('skips static files but covers pages', () => {
    const [pattern] = config.matcher;
    const matcher = new RegExp(`^${pattern}$`);
    for (const path of ['/', '/routines/abc', '/login', '/auth/confirm']) {
      expect(matcher.test(path)).toBe(true);
    }
    for (const path of ['/_next/static/x.js', '/favicon.ico', '/exercises/squat.svg', '/a.png']) {
      expect(matcher.test(path)).toBe(false);
    }
  });
});

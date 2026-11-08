import { describe, expect, it } from 'vitest';

import { SupabaseConfigError, validateSupabaseEnv } from './env';

const fakeJwt = (role: string) =>
  `x.${btoa(JSON.stringify({ role })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.y`;

describe('validateSupabaseEnv', () => {
  it('accepts a project URL and publishable key', () => {
    expect(
      validateSupabaseEnv({ url: ' https://abcd.supabase.co/ ', publishableKey: 'sb_publishable_x' }),
    ).toEqual({ url: 'https://abcd.supabase.co', publishableKey: 'sb_publishable_x' });
    expect(
      validateSupabaseEnv({ url: 'http://127.0.0.1:54321', publishableKey: fakeJwt('anon') }).url,
    ).toBe('http://127.0.0.1:54321');
  });

  it('names every missing setting at once', () => {
    expect(() => validateSupabaseEnv({ url: undefined, publishableKey: '' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is missing[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing[\s\S]*\.env\.local/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() => validateSupabaseEnv({ url: 'abcd.supabase.co', publishableKey: 'k' })).toThrow(
      SupabaseConfigError,
    );
    expect(() => validateSupabaseEnv({ url: 'ftp://x.test', publishableKey: 'k' })).toThrow(
      /must be a URL/,
    );
  });

  it.each(['sb_secret_abc', fakeJwt('service_role')])(
    'refuses to ship a privileged key to the browser (%s)',
    (key) => {
      expect(() => validateSupabaseEnv({ url: 'https://a.supabase.co', publishableKey: key })).toThrow(
        /secret\/service-role key/,
      );
    },
  );
});

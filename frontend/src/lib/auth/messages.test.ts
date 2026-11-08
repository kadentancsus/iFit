import { describe, expect, it } from 'vitest';

import { authErrorMessage, NETWORK_MESSAGE, validateCredentials } from './messages';

describe('validateCredentials', () => {
  it('accepts a valid sign-in and sign-up', () => {
    expect(validateCredentials({ email: ' a@b.co ', password: 'x' }, 'login')).toEqual({});
    expect(
      validateCredentials({ email: 'a@b.co', password: 'longenough', displayName: 'Sam' }, 'signup'),
    ).toEqual({});
  });

  it('names each missing or malformed field', () => {
    expect(validateCredentials({ email: '', password: '' }, 'login')).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateCredentials({ email: 'not-an-email', password: 'x' }, 'login').email).toMatch(
      /like name@example.com/,
    );
  });

  it('applies password and name rules only when creating an account', () => {
    expect(validateCredentials({ email: 'a@b.co', password: 'short' }, 'login')).toEqual({});
    expect(validateCredentials({ email: 'a@b.co', password: 'short' }, 'signup').password).toBe(
      'Use at least 8 characters.',
    );
    expect(
      validateCredentials({ email: 'a@b.co', password: 'x'.repeat(73) }, 'signup').password,
    ).toBe('Use at most 72 characters.');
    expect(
      validateCredentials(
        { email: 'a@b.co', password: 'longenough', displayName: 'n'.repeat(51) },
        'signup',
      ).displayName,
    ).toBe('Use at most 50 characters.');
  });
});

describe('authErrorMessage', () => {
  it('explains known Supabase errors in plain language', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', status: 400 })).toMatch(/don't match/);
    expect(authErrorMessage({ code: 'email_not_confirmed', status: 400 })).toMatch(/Confirm your email/);
    expect(authErrorMessage({ code: 'user_already_exists', status: 422 })).toMatch(/already exists/);
    expect(authErrorMessage({ code: 'weak_password', status: 422 })).toMatch(/stronger password/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it('recognises network failures', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(NETWORK_MESSAGE);
  });

  it('never shows raw server text', () => {
    const message = authErrorMessage({ status: 500, message: 'pq: relation "auth.users" broke' });
    expect(message).not.toContain('auth.users');
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
    expect(authErrorMessage('boom')).toMatch(/Something went wrong/);
  });
});

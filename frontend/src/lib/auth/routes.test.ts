import { describe, expect, it } from 'vitest';

import { isAuthPage, isPublicPath, loginPath, routeDecision, safeNextPath } from './routes';

describe('public and protected paths', () => {
  it('lets only sign-in, sign-up and email confirmation through', () => {
    for (const path of ['/login', '/signup', '/auth/confirm']) expect(isPublicPath(path)).toBe(true);
    for (const path of ['/', '/profile', '/routines/abc', '/workout/1', '/loginx', '/auth']) {
      expect(isPublicPath(path)).toBe(false);
    }
    expect(isAuthPage('/auth/confirm')).toBe(false);
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/routines', '/routines'],
    ['/history/abc?tab=sets#top', '/history/abc?tab=sets#top'],
    ['/routines/../profile', '/profile'],
  ])('keeps the in-app path %s', (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'routines',
    '//evil.test',
    '//evil.test/path',
    '/\\evil.test',
    'https://evil.test',
    'javascript:alert(1)',
    '/\t/evil.test',
    '/login',
    '/signup?next=/x',
    '/auth/confirm',
  ])('falls back to home for %j', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });
});

describe('loginPath', () => {
  it('remembers where to come back to', () => {
    expect(loginPath('/routines/abc?x=1')).toBe('/login?next=%2Froutines%2Fabc%3Fx%3D1');
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('//evil.test')).toBe('/login');
  });
});

describe('routeDecision', () => {
  it('sends signed-out visitors to sign in, then back', () => {
    expect(routeDecision('/history/42', '?page=2', false)).toEqual({
      type: 'redirect',
      to: '/login?next=%2Fhistory%2F42%3Fpage%3D2',
    });
    expect(routeDecision('/', '', false)).toEqual({ type: 'redirect', to: '/login' });
  });

  it('lets signed-out visitors use the public pages', () => {
    expect(routeDecision('/login', '', false)).toEqual({ type: 'continue' });
    expect(routeDecision('/auth/confirm', '?code=abc', false)).toEqual({ type: 'continue' });
  });

  it('moves signed-in users off the sign-in pages to a safe destination', () => {
    expect(routeDecision('/login', '?next=/routines', true, '/routines')).toEqual({
      type: 'redirect',
      to: '/routines',
    });
    expect(routeDecision('/signup', '', true, 'https://evil.test')).toEqual({
      type: 'redirect',
      to: '/',
    });
  });

  it('lets signed-in users through everywhere else, including confirmation', () => {
    expect(routeDecision('/profile', '', true)).toEqual({ type: 'continue' });
    expect(routeDecision('/auth/confirm', '?code=abc', true)).toEqual({ type: 'continue' });
  });
});

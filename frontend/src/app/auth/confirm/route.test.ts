import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverSupabase: async () => ({ auth }),
}));

const { GET } = await import('./route');

const visit = (query: string) =>
  GET(new NextRequest(new URL(`/auth/confirm${query}`, 'http://localhost:3000')));

beforeEach(() => {
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe('email confirmation link', () => {
  it('signs in with a PKCE code and continues to a safe page', async () => {
    const response = await visit('?code=abc&next=%2Froutines');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(response.headers.get('location')).toBe('/routines');
  });

  it('verifies a token hash link', async () => {
    const response = await visit('?token_hash=h&type=signup');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'signup' });
    expect(response.headers.get('location')).toBe('/');
  });

  it('ignores an off-site next parameter', async () => {
    const response = await visit('?code=abc&next=https%3A%2F%2Fevil.test');
    expect(response.headers.get('location')).toBe('/');
  });

  it.each([
    ['an expired code', '?code=old', () => auth.exchangeCodeForSession.mockResolvedValue({ error: {} })],
    ['an unknown link type', '?token_hash=h&type=bogus', () => {}],
    ['no code at all', '', () => {}],
    ['an error from Supabase', '?error=access_denied&code=abc', () => {}],
  ])('explains a failed confirmation for %s', async (_, query, arrange) => {
    arrange();
    const response = await visit(query);
    expect(response.headers.get('location')).toBe(
      '/login?error=confirm_failed',
    );
  });
});

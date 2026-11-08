import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { AuthForm } = await import('./auth-form');

describe('AuthForm', () => {
  it('signs in with labeled email and password fields that password managers recognise', () => {
    const html = renderToStaticMarkup(<AuthForm mode="login" next="/" />);
    expect(html).toMatch(/<label[^>]*>Email<\/label>/);
    expect(html).toMatch(/<label[^>]*>Password<\/label>/);
    expect(html).toMatch(/autocomplete="email"/i);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain('type="submit"');
    expect(html).toContain('>Sign in<');
    expect(html).not.toContain('displayName');
    expect(html).toContain('href="/signup"');
  });

  it('asks for a new password and an optional name when creating an account', () => {
    const html = renderToStaticMarkup(<AuthForm mode="signup" next="/routines" />);
    expect(html).toMatch(/autocomplete="new-password"/i);
    expect(html).toContain('name="displayName"');
    expect(html).toContain('At least 8 characters.');
    expect(html).toContain('>Create account<');
    // The way back to sign-in keeps the destination.
    expect(html).toContain('href="/login?next=%2Froutines"');
  });

  it('shows a notice carried over from a redirect', () => {
    const html = renderToStaticMarkup(
      <AuthForm mode="login" next="/" notice="You have been signed out." />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('You have been signed out.');
  });
});

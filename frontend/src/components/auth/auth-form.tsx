'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import {
  authErrorMessage,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
  type FieldErrors,
} from '@/lib/auth/messages';
import { safeNextPath } from '@/lib/auth/routes';
import { browserSupabase } from '@/lib/supabase/client';
import { SupabaseConfigError } from '@/lib/supabase/env';

export type AuthMode = 'login' | 'signup';

type Status =
  | { type: 'idle' }
  | { type: 'pending' }
  | { type: 'error'; message: string }
  | { type: 'check-email'; email: string };

/**
 * Email/password sign-in or sign-up. Typed values stay in the form after a
 * failure so the user can fix and retry; success is only shown after Supabase
 * answers.
 */
export function AuthForm({
  mode,
  next,
  notice,
}: {
  mode: AuthMode;
  /** Where to go after signing in (already checked by safeNextPath). */
  next: string;
  /** Message carried over from a redirect, e.g. a failed confirmation link. */
  notice?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const signup = mode === 'signup';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.type === 'pending') return;
    const form = new FormData(event.currentTarget);
    const input = {
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      displayName: String(form.get('displayName') ?? '').trim(),
    };

    const fieldErrors = validateCredentials(input, mode);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      setStatus({ type: 'idle' });
      return;
    }

    setStatus({ type: 'pending' });
    try {
      const auth = browserSupabase().auth;
      if (signup) {
        const { data, error } = await auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            // Read by the 0001_identity sign-up trigger to name the profile.
            data: input.displayName ? { display_name: input.displayName } : {},
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(safeNextPath(next))}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is on (or the address is already registered;
          // Supabase deliberately does not say which).
          setStatus({ type: 'check-email', email: input.email });
          return;
        }
      } else {
        const { error } = await auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (error) throw error;
      }
      router.replace(safeNextPath(next));
      router.refresh();
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof SupabaseConfigError ? error.message : authErrorMessage(error),
      });
    }
  }

  if (status.type === 'check-email') {
    return (
      <Alert tone="success" title="Check your email">
        <p>
          We sent a confirmation link to <strong>{status.email}</strong>. Open it on this device
          to finish creating your account, then you&apos;ll be signed in.
        </p>
        <p className="mt-2">
          Already confirmed?{' '}
          <Link href="/login" className="font-semibold text-brand underline">
            Sign in
          </Link>
        </p>
      </Alert>
    );
  }

  const pending = status.type === 'pending';
  const otherHref = `${signup ? '/login' : '/signup'}${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-busy={pending}>
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {status.type === 'error' ? <Alert tone="danger">{status.message}</Alert> : null}

      {signup ? (
        <TextField
          label="Name (optional)"
          name="displayName"
          autoComplete="nickname"
          maxLength={50}
          hint="Shown on your dashboard. You can change it later."
          error={errors.displayName}
        />
      ) : null}
      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={errors.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete={signup ? 'new-password' : 'current-password'}
        required
        minLength={signup ? MIN_PASSWORD_LENGTH : undefined}
        hint={signup ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        error={errors.password}
      />

      <Button
        type="submit"
        pending={pending}
        pendingLabel={signup ? 'Creating account…' : 'Signing in…'}
      >
        {signup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted">
        {signup ? 'Already have an account? ' : 'New to iFit? '}
        <Link href={otherHref} className="font-semibold text-brand underline">
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </form>
  );
}

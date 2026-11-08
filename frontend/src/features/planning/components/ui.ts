/** Shared class names for planning and catalog screens, built on the global tokens. */
export const ui = {
  input:
    'min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base aria-invalid:border-danger',
  button:
    'inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 font-semibold hover:border-brand disabled:opacity-60',
  primaryButton:
    'inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-brand-contrast hover:bg-brand-strong disabled:opacity-60',
  dangerButton:
    'inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-5 font-semibold text-background disabled:opacity-60',
  card: 'rounded-xl border border-border bg-surface p-4',
  link: 'flex min-h-11 items-center self-start text-brand underline-offset-4 hover:underline',
} as const;

export const isSignedOut = (code: string | undefined) =>
  code === 'not_authenticated' || code === 'invalid_session';

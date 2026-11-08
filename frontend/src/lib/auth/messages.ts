/** Form validation and plain-language messages for sign-in and sign-up. */

/** Supabase's default minimum is 6; iFit asks for a little more. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores anything longer
export const MAX_DISPLAY_NAME_LENGTH = 50; // matches profiles.display_name

export type FieldErrors = Partial<Record<'displayName' | 'email' | 'password', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CredentialsInput {
  email: string;
  password: string;
  displayName?: string;
}

/** Returns an error per invalid field; empty when the form can be sent. */
export function validateCredentials(
  input: CredentialsInput,
  mode: 'login' | 'signup',
): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email.trim();

  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter an email address like name@example.com.';

  if (!input.password) {
    errors.password = 'Enter your password.';
  } else if (mode === 'signup') {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (input.password.length > MAX_PASSWORD_LENGTH) {
      errors.password = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
    }
  }

  if (mode === 'signup' && (input.displayName?.trim().length ?? 0) > MAX_DISPLAY_NAME_LENGTH) {
    errors.displayName = `Use at most ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  }
  return errors;
}

/** The parts of a Supabase AuthError we look at. */
interface AuthErrorLike {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed:
    'Confirm your email first. Open the link we sent you, then sign in.',
  user_already_exists: 'An account with that email already exists. Try signing in instead.',
  email_exists: 'An account with that email already exists. Try signing in instead.',
  weak_password: 'Choose a stronger password: longer, and not a common one.',
  over_email_send_rate_limit: 'Too many emails were sent. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  signup_disabled: 'New sign-ups are turned off for this app.',
  email_address_invalid: 'That email address was not accepted. Try a different one.',
  session_expired: 'Your session expired. Please sign in again.',
};

export const NETWORK_MESSAGE = "Couldn't reach the sign-in service. Check your connection and try again.";
const FALLBACK = 'Something went wrong signing you in. Please try again.';

/** A safe, specific message for a Supabase Auth error. Never shows raw server text. */
export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return FALLBACK;
  const { code, status, name } = error as AuthErrorLike;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (name === 'AuthRetryableFetchError' || status === 0) return NETWORK_MESSAGE;
  if (status === 429) return MESSAGES.over_request_rate_limit!;
  if (status === 400 && !code) return MESSAGES.invalid_credentials!;
  return FALLBACK;
}

/** Messages for `/login?error=…` after a redirect. */
export const LOGIN_NOTICES: Record<string, string> = {
  confirm_failed:
    "We couldn't finish confirming your email from that link. If you already confirmed it, sign in below.",
  signed_out: 'You have been signed out.',
};

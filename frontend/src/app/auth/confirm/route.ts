/**
 * Where the confirmation email link lands. Supabase sends either a one-time
 * `code` (PKCE) or a `token_hash` + `type`; either becomes a signed-in session.
 */
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { safeNextPath } from '@/lib/auth/routes';
import { serverSupabase } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'email', 'invite', 'magiclink', 'recovery', 'email_change'];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  let confirmed = false;
  if (!searchParams.get('error')) {
    const supabase = await serverSupabase();
    if (code) {
      confirmed = !(await supabase.auth.exchangeCodeForSession(code)).error;
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      confirmed = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    }
  }

  // A relative Location keeps the browser on the exact host it used, so the
  // session cookies just set are sent with the next request.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: confirmed ? next : '/login?error=confirm_failed' },
  });
}

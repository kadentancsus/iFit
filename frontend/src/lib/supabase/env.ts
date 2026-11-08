/**
 * Supabase settings for the browser and the Next.js server. Values come from
 * frontend/.env.local (see .env.example). They are browser-safe by design:
 * a secret or service-role key is refused rather than shipped to users.
 */

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

export class SupabaseConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `iFit cannot sign anyone in because frontend settings are missing or invalid:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        `\nCopy frontend/.env.example to frontend/.env.local, fill in your Supabase values and restart.`,
    );
    this.name = 'SupabaseConfigError';
  }
}

function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/** Checks raw values; throws a SupabaseConfigError naming every problem. */
export function validateSupabaseEnv(raw: {
  url: string | undefined;
  publishableKey: string | undefined;
}): SupabaseEnv {
  const problems: string[] = [];
  const url = raw.url?.trim() ?? '';
  const publishableKey = raw.publishableKey?.trim() ?? '';

  if (!url) {
    problems.push('NEXT_PUBLIC_SUPABASE_URL is missing');
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
    } catch {
      problems.push('NEXT_PUBLIC_SUPABASE_URL must be a URL like https://abcd1234.supabase.co');
    }
  }

  if (!publishableKey) {
    problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing');
  } else if (publishableKey.startsWith('sb_secret_') || jwtRole(publishableKey) === 'service_role') {
    problems.push(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a secret/service-role key; use the publishable (anon) key',
    );
  }

  if (problems.length) throw new SupabaseConfigError(problems);
  return { url: url.replace(/\/+$/, ''), publishableKey };
}

/** Reads this app's settings. The literal names let Next.js inline them for the browser. */
export function supabaseEnv(): SupabaseEnv {
  return validateSupabaseEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

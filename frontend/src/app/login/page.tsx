import type { Metadata } from 'next';

import { AuthForm } from '@/components/auth/auth-form';
import { PageHeader } from '@/components/ui/layout';
import { LOGIN_NOTICES } from '@/lib/auth/messages';
import { safeNextPath } from '@/lib/auth/routes';

export const metadata: Metadata = { title: 'Sign in' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const notice = LOGIN_NOTICES[first(params.error) ?? ''] ?? null;
  return (
    <div className="mx-auto w-full max-w-sm">
      <PageHeader title="Sign in" description="Pick up where you left off." />
      <AuthForm mode="login" next={safeNextPath(first(params.next))} notice={notice} />
    </div>
  );
}

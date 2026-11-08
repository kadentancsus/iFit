import type { Metadata } from 'next';

import { AuthForm } from '@/components/auth/auth-form';
import { PageHeader } from '@/components/ui/layout';
import { safeNextPath } from '@/lib/auth/routes';

export const metadata: Metadata = { title: 'Create account' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const params = await searchParams;
  return (
    <div className="mx-auto w-full max-w-sm">
      <PageHeader
        title="Create your account"
        description="Your routines and workout history stay private to you."
      />
      <AuthForm mode="signup" next={safeNextPath(first(params.next))} />
    </div>
  );
}

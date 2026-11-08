import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/layout';
import { ProfileSettings } from '@/features/identity/components/ProfileSettings';
import { requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await requireUser('/profile');
  return (
    <>
      <PageHeader
        title="Profile"
        description={user.email ? `Signed in as ${user.email}` : undefined}
      />
      <ProfileSettings />
    </>
  );
}

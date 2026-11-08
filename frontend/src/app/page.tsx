import { PageHeader } from '@/components/ui/layout';
import { requireUser } from '@/lib/supabase/server';

export default async function HomePage() {
  await requireUser('/');
  return (
    <PageHeader
      title="Making every workout count"
      description="Log sets in a tap, swap equipment that's taken, and check your form without losing your place."
    />
  );
}

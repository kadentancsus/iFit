import { DashboardView } from '@/features/identity/components/DashboardView';
import { requireUser } from '@/lib/supabase/server';

export default async function HomePage() {
  await requireUser('/');
  return <DashboardView />;
}

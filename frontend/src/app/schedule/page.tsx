import type { Metadata } from 'next';

import { SchedulePlanner } from '@/features/planning/components/SchedulePlanner';

export const metadata: Metadata = { title: 'Schedule' };

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const { routine } = await searchParams;
  return <SchedulePlanner initialRoutineId={typeof routine === 'string' ? routine : undefined} />;
}

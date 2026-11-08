import type { Metadata } from 'next';

import { RoutineList } from '@/features/planning/components/RoutineList';

export const metadata: Metadata = { title: 'Routines' };

export default function RoutinesPage() {
  return <RoutineList />;
}

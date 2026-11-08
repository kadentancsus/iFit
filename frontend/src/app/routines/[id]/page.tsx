import type { Metadata } from 'next';

import { RoutineEditor } from '@/features/planning/components/RoutineEditor';

export const metadata: Metadata = { title: 'Routine' };

export default async function RoutinePage({ params, searchParams }: PageProps<'/routines/[id]'>) {
  const { id } = await params;
  const { template } = await searchParams;

  return (
    <RoutineEditor
      key={id}
      routineId={id === 'new' ? null : id}
      templateSlug={typeof template === 'string' ? template : undefined}
    />
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { workoutApi } from '@/features/workout/api';
import { getAccessToken } from '@/lib/supabase/client';

import {
  StartOperations,
  startPlannedWorkout,
  workoutPath,
  type StartablePlan,
} from '../start-workout';

/** Shared across buttons so a re-render never loses an in-flight operation ID. */
const operations = new StartOperations();
const workouts = workoutApi(getAccessToken);

export function StartWorkoutButton({
  plan,
  start = workouts.startWorkout,
}: {
  plan: StartablePlan;
  start?: typeof workouts.startWorkout;
}) {
  const router = useRouter();
  const [state, setState] = useState<
    { type: 'idle' } | { type: 'pending' } | { type: 'failed'; message: string }
  >({ type: 'idle' });
  const errorId = `start-${plan.id}-error`;

  async function onStart() {
    if (state.type === 'pending') return;
    setState({ type: 'pending' });
    const outcome = await startPlannedWorkout(plan, start, operations);
    if (outcome.type === 'failed') {
      setState({ type: 'failed', message: outcome.message });
      return;
    }
    // Stay pending while the workout page loads; the session already exists.
    router.push(workoutPath(outcome.sessionId));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={onStart}
        pending={state.type === 'pending'}
        pendingLabel="Starting…"
        aria-describedby={state.type === 'failed' ? errorId : undefined}
      >
        {state.type === 'failed' ? 'Try again' : 'Start'}
        <span className="sr-only">: {plan.routineTitle}</span>
      </Button>
      {state.type === 'failed' ? (
        <p id={errorId} role="alert" className="max-w-xs text-right text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

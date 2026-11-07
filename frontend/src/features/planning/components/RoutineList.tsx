'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ROUTINE_TEMPLATES } from '@/features/catalog';

import { routinesApi } from '../api';
import type { ApiResult, RoutineSummary } from '../api';

const primaryLink =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-brand-contrast hover:bg-brand-strong';
const card = 'block rounded-xl border border-border bg-surface p-4 hover:border-brand';

const exerciseCount = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`;

function SavedRoutines({
  result,
  onRetry,
}: {
  result: ApiResult<RoutineSummary[]> | null;
  onRetry: () => void;
}) {
  if (!result) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your routines…</span>
        <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }

  if (result.error?.code === 'not_authenticated' || result.error?.code === 'invalid_session') {
    return <p className="text-muted">Sign in to see and save your routines.</p>;
  }

  if (result.error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p>{result.error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 font-semibold hover:border-brand"
        >
          Try again
        </button>
      </div>
    );
  }

  if (result.data.length === 0) {
    return <p className="text-muted">No routines yet. Build one, or start from a template below.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {result.data.map((routine) => (
        <li key={routine.id}>
          <Link href={`/routines/${routine.id}`} className={card}>
            <span className="block font-semibold">{routine.title}</span>
            <span className="block text-sm text-muted">{exerciseCount(routine.exerciseCount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RoutineList() {
  const [result, setResult] = useState<ApiResult<RoutineSummary[]> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void routinesApi.listRoutines().then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = () => {
    setResult(null);
    setAttempt((value) => value + 1);
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="routines-title" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h1 id="routines-title" className="text-3xl font-bold tracking-tight">
            Routines
          </h1>
          <Link href="/routines/new" className={primaryLink}>
            New routine
          </Link>
        </div>
        <SavedRoutines result={result} onRetry={retry} />
      </section>

      <section aria-labelledby="templates-title" className="flex flex-col gap-3">
        <h2 id="templates-title" className="text-xl font-semibold">
          Start from a template
        </h2>
        <ul className="flex flex-col gap-3">
          {ROUTINE_TEMPLATES.map((template) => (
            <li key={template.id}>
              <Link href={`/routines/new?template=${template.slug}`} className={card}>
                <span className="block font-semibold">{template.title}</span>
                <span className="block text-sm text-muted">{template.description}</span>
                <span className="mt-1 block text-sm text-muted">
                  {exerciseCount(template.exercises.length)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

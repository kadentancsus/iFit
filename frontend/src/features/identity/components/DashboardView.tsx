'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { buttonClasses, Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import type { ApiResult, Dashboard, ScheduledWorkout } from '@/lib/contracts';
import { formatLocalDate, formatTime, localDateIn, relativeDayLabel } from '@/lib/dates';

import { identityApi } from '../api';
import { progressTiles, sessionDetails, sessionStatusLabel } from '../dashboard-view';

const api = identityApi();

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `dashboard-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PlanList({ plans, today }: { plans: ScheduledWorkout[]; today: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Card className="flex items-center justify-between gap-3">
            <span className="font-semibold">{plan.routineTitle}</span>
            <span className="text-sm text-muted">
              {plan.status === 'completed' ? 'Done' : relativeDayLabel(plan.localDate, today)}
            </span>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** The dashboard for loaded data. */
export function DashboardContent({ data }: { data: Dashboard }) {
  const { profile, today } = data;
  const unit = profile.displayUnit;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`Hi, ${profile.displayName}`} description={formatLocalDate(today, 'long')} />

      {data.activeWorkout ? (
        <Alert tone="info" title="Workout in progress">
          {data.activeWorkout.routineNameSnapshot}, started at{' '}
          {formatTime(data.activeWorkout.startedAt, profile.timezone)}.
        </Alert>
      ) : null}

      <Section title="Today">
        {data.todaysWorkouts.length ? (
          <PlanList plans={data.todaysWorkouts} today={today} />
        ) : (
          <EmptyState
            title="Nothing planned today"
            description="Rest is training too. Or plan a routine whenever you like."
            action={
              <Link href="/schedule" className={buttonClasses('secondary')}>
                Plan a workout
              </Link>
            }
          />
        )}
      </Section>

      {data.upcomingWorkouts.length ? (
        <Section title="Coming up">
          <PlanList plans={data.upcomingWorkouts} today={today} />
        </Section>
      ) : null}

      <Section title="Your progress">
        <dl className="grid grid-cols-3 gap-2">
          {progressTiles(data.progress).map((tile) => (
            <Card key={tile.label} className="flex flex-col-reverse gap-1 p-3">
              <dt className="text-xs text-muted">{tile.label}</dt>
              <dd className="text-2xl font-bold">{tile.value}</dd>
            </Card>
          ))}
        </dl>
        <p className="text-xs text-muted">Private to you. Counts finished workouts and logged sets.</p>
      </Section>

      <Section title="Recent workouts">
        {data.recentSessions.length ? (
          <ul className="flex flex-col gap-2">
            {data.recentSessions.map((session) => {
              const status = sessionStatusLabel(session);
              return (
                <li key={session.id}>
                  <Card className="flex flex-col gap-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{session.routineNameSnapshot}</span>
                      <span className="text-sm text-muted">
                        {formatLocalDate(localDateIn(profile.timezone, Date.parse(session.startedAt)))}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {sessionDetails(session, unit)}
                      {status ? ` · ${status}` : ''}
                    </span>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted">Finished workouts will show up here.</p>
        )}
        {data.recentSessions.some((session) => session.weightedVolumeKg !== null) ? (
          <p className="text-xs text-muted">
            &quot;Lifted&quot; adds up reps × weight for weighted sets only; bodyweight sets
            aren&apos;t included.
          </p>
        ) : null}
      </Section>
    </div>
  );
}

export function DashboardView() {
  const [result, setResult] = useState<ApiResult<Dashboard> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void api.getDashboard().then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [attempt]);

  if (!result) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading your dashboard…</span>
        <div className="h-10 w-1/2 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (result.error) {
    return (
      <Alert
        tone="danger"
        title="Couldn't load your dashboard"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        {result.error.message}
      </Alert>
    );
  }
  return <DashboardContent data={result.data} />;
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { routinesApi, scheduleApi } from '../api';
import type { ApiError, RoutineSummary, ScheduledWorkout } from '../api';
import { STATUS_LABELS, addDays, dayLabel, localToday, splitSchedule } from '../schedule-dates';
import { isSignedOut, ui } from './ui';

/** History shown under the upcoming list. */
const RECENT_DAYS = 14;
/** Matches the API's limit on planning ahead. */
const MAX_DAYS_AHEAD = 366;

interface Loaded {
  routines: RoutineSummary[];
  schedule: ScheduledWorkout[];
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function PlanForm({
  routines,
  today,
  initialRoutineId,
  onStart,
  onPlanned,
}: {
  routines: RoutineSummary[];
  today: string;
  initialRoutineId?: string;
  /** Clears the previous result message so it can't contradict this one. */
  onStart: () => void;
  onPlanned: (message: string) => void;
}) {
  const routineField = useId();
  const dateField = useId();
  const [routineId, setRoutineId] = useState(
    routines.some((routine) => routine.id === initialRoutineId)
      ? initialRoutineId!
      : (routines[0]?.id ?? ''),
  );
  const [localDate, setLocalDate] = useState(today);
  // Kept across retries of one submission so a lost response can't plan twice.
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    onStart();
    if (localDate < today) {
      setError({ code: 'date_in_past', message: 'Choose today or a later date.', field: 'localDate' });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await scheduleApi.scheduleRoutine({ routineId, localDate, operationId });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOperationId(crypto.randomUUID());
    onPlanned(`${result.data.routineTitle} planned for ${dayLabel(result.data.localDate, today)}.`);
  };

  const fieldMessage = (field: string) => (error?.field === field ? error.message : undefined);
  const generalError = error && !['routineId', 'localDate'].includes(error.field ?? '') ? error : null;

  return (
    <form onSubmit={submit} noValidate className={`${ui.card} flex flex-col gap-4`}>
      <h2 className="text-xl font-semibold">Plan a workout</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={routineField} className="text-sm text-muted">
            Routine
          </label>
          <select
            id={routineField}
            value={routineId}
            onChange={(event) => setRoutineId(event.target.value)}
            aria-invalid={fieldMessage('routineId') ? true : undefined}
            aria-describedby={`${routineField}-error`}
            className={ui.input}
          >
            {routines.map((routine) => (
              <option key={routine.id} value={routine.id}>
                {routine.title}
              </option>
            ))}
          </select>
          <FieldError id={`${routineField}-error`} message={fieldMessage('routineId')} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={dateField} className="text-sm text-muted">
            Day
          </label>
          <input
            id={dateField}
            type="date"
            required
            min={today}
            max={addDays(today, MAX_DAYS_AHEAD)}
            value={localDate}
            onChange={(event) => setLocalDate(event.target.value)}
            aria-invalid={fieldMessage('localDate') ? true : undefined}
            aria-describedby={`${dateField}-error`}
            className={ui.input}
          />
          <FieldError id={`${dateField}-error`} message={fieldMessage('localDate')} />
        </div>
      </div>
      {generalError ? (
        <p role="alert" className="text-danger">
          {generalError.message}
        </p>
      ) : null}
      <button type="submit" disabled={busy || !routineId} className={`${ui.primaryButton} self-start`}>
        {busy ? 'Planning…' : 'Plan workout'}
      </button>
    </form>
  );
}

function UpcomingItem({
  item,
  today,
  onStart,
  onChanged,
}: {
  item: ScheduledWorkout;
  today: string;
  onStart: () => void;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'move' | 'cancel'>('view');
  const [localDate, setLocalDate] = useState(item.localDate);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const dateField = useId();
  const label = dayLabel(item.localDate, today);

  const finish = (result: { error: ApiError | null }, message: string) => {
    setBusy(false);
    if (result.error) setError(result.error);
    else onChanged(message);
  };

  const move = async (event: React.FormEvent) => {
    event.preventDefault();
    onStart();
    if (localDate < today) {
      setError({ code: 'date_in_past', message: 'Choose today or a later date.', field: 'localDate' });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await scheduleApi.rescheduleWorkout(item.id, localDate);
    finish(result, `${item.routineTitle} moved to ${dayLabel(localDate, today)}.`);
  };

  const cancel = async () => {
    onStart();
    setBusy(true);
    setError(null);
    const result = await scheduleApi.cancelScheduledWorkout(item.id);
    finish(result, `${item.routineTitle} on ${label} canceled.`);
  };

  return (
    <li className={`${ui.card} flex flex-col gap-3`}>
      <div>
        <p className="text-sm font-semibold text-brand">{label}</p>
        <h3 className="text-lg font-semibold">{item.routineTitle}</h3>
      </div>

      {mode === 'view' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('move')} className={ui.button}>
            Change day
          </button>
          <button
            type="button"
            onClick={() => setMode('cancel')}
            className={`${ui.button} ml-auto text-danger`}
          >
            Cancel workout
          </button>
        </div>
      ) : null}

      {mode === 'move' ? (
        <form onSubmit={move} noValidate className="flex flex-col gap-2">
          <label htmlFor={dateField} className="text-sm text-muted">
            New day for {item.routineTitle}
          </label>
          <input
            id={dateField}
            type="date"
            autoFocus
            min={today}
            max={addDays(today, MAX_DAYS_AHEAD)}
            value={localDate}
            onChange={(event) => setLocalDate(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${dateField}-error`}
            className={ui.input}
          />
          <FieldError id={`${dateField}-error`} message={error?.message} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={ui.primaryButton}>
              {busy ? 'Saving…' : 'Save day'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('view');
                setError(null);
                setLocalDate(item.localDate);
              }}
              className={ui.button}
            >
              Keep {label.toLowerCase().startsWith('to') ? label.toLowerCase() : label}
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'cancel' ? (
        <div role="alertdialog" aria-label={`Cancel ${item.routineTitle}?`} className="flex flex-col gap-2">
          <p>Cancel this workout? You can plan it again any time.</p>
          {error ? (
            <p role="alert" className="text-danger">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cancel} disabled={busy} className={ui.dangerButton}>
              Yes, cancel it
            </button>
            <button type="button" autoFocus onClick={() => setMode('view')} className={ui.button}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function SchedulePlanner({ initialRoutineId }: { initialRoutineId?: string }) {
  const [today] = useState(localToday);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Announced once the refreshed list arrives, so the message never describes
  // a change the list doesn't show yet.
  const pendingStatus = useRef('');

  useEffect(() => {
    let current = true;
    void Promise.all([
      routinesApi.listRoutines(),
      scheduleApi.listSchedule({ from: addDays(today, -RECENT_DAYS) }),
    ]).then(([routines, schedule]) => {
      if (!current) return;
      const failed = routines.error ?? schedule.error;
      if (failed) {
        setError(failed);
        return;
      }
      setLoaded({ routines: routines.data!, schedule: schedule.data! });
      setStatus(pendingStatus.current);
      pendingStatus.current = '';
    });
    return () => {
      current = false;
    };
  }, [today, attempt]);

  const clearStatus = useCallback(() => setStatus(''), []);

  const reload = useCallback((message: string) => {
    pendingStatus.current = message;
    setAttempt((value) => value + 1);
  }, []);

  if (error) {
    return (
      <section role="alert" className="flex flex-col items-start gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted">
          {isSignedOut(error.code) ? 'Sign in to plan your workouts.' : error.message}
        </p>
        {isSignedOut(error.code) ? null : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}
            className={ui.button}
          >
            Try again
          </button>
        )}
      </section>
    );
  }

  if (!loaded) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your schedule…</span>
        <div className="h-8 w-1/2 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }

  const { upcoming, recent } = splitSchedule(loaded.schedule, today);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>

      <p role="status" aria-live="polite" className="-my-4 min-h-6 text-success">
        {status}
      </p>

      {loaded.routines.length === 0 ? (
        <section className={`${ui.card} flex flex-col items-start gap-3`}>
          <h2 className="text-xl font-semibold">Plan a workout</h2>
          <p className="text-muted">Create a routine first, then plan which days to do it.</p>
          <Link href="/routines" className={ui.primaryButton}>
            Create a routine
          </Link>
        </section>
      ) : (
        <PlanForm
          routines={loaded.routines}
          today={today}
          initialRoutineId={initialRoutineId}
          onStart={clearStatus}
          onPlanned={reload}
        />
      )}

      <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
        <h2 id="upcoming-title" className="text-xl font-semibold">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted">Nothing planned yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((item) => (
              <UpcomingItem
                key={`${item.id}-${item.localDate}`}
                item={item}
                today={today}
                onStart={clearStatus}
                onChanged={reload}
              />
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 ? (
        <section aria-labelledby="recent-title" className="flex flex-col gap-3">
          <h2 id="recent-title" className="text-xl font-semibold">
            Last {RECENT_DAYS} days
          </h2>
          <ul className="flex flex-col gap-2">
            {recent.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-border py-2">
                <span>
                  <span className="block font-semibold">{item.routineTitle}</span>
                  <span className="block text-sm text-muted">{dayLabel(item.localDate, today)}</span>
                </span>
                <span className="text-sm text-muted">{STATUS_LABELS[item.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

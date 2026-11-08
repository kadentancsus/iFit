'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import type { DisplayUnit, LogSetInput, WorkoutDetail, WorkoutExercise } from '@/lib/contracts';
import { formatLoad, kgToDisplay, loadConventionLabel, parseWeightInput } from '@/lib/units';

import { workoutApi } from './api';

export interface ActiveWorkoutProps {
  sessionId: string;
  getAccessToken: () => Promise<string | null>;
  displayUnit: DisplayUnit;
}

/** Identity supplies its token getter; no separate token storage/login is created here. */
export function ActiveWorkout({ sessionId, getAccessToken, displayUnit }: ActiveWorkoutProps) {
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void workoutApi(getAccessToken).getWorkout(sessionId).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else { setDetail(result.data); setError(null); }
    }).catch(() => { if (!cancelled) setError('Sign in again, then retry loading your workout.'); });
    return () => { cancelled = true; };
  }, [sessionId, getAccessToken, reload]);

  if (!detail) return <section aria-label="Workout">
    {error ? <><p role="alert">{error}</p><Button onClick={() => setReload((n) => n + 1)}>Retry</Button></> : <p role="status">Loading workout…</p>}
  </section>;
  return <section className="flex flex-col gap-4" aria-label="Active workout">
    <h1 className="text-2xl font-bold">{detail.session.routineNameSnapshot}</h1>
    {detail.exercises.map((exercise) => <ExerciseLogger key={exercise.entry.id}
      exercise={exercise} unit={displayUnit} active={detail.session.status === 'active'}
      getAccessToken={getAccessToken} onSaved={() => setReload((n) => n + 1)} />)}
  </section>;
}

function ExerciseLogger({ exercise, unit, active, getAccessToken, onSaved }: {
  exercise: WorkoutExercise; unit: DisplayUnit; active: boolean;
  getAccessToken: () => Promise<string | null>; onSaved: () => void;
}) {
  const { entry, lastPerformance } = exercise;
  const bodyweight = entry.loadConventionSnapshot === 'bodyweight';
  const initialKg = lastPerformance?.weightKg ?? entry.targets.targetKg;
  const [reps, setReps] = useState(String(lastPerformance?.reps ?? entry.targets.targetReps));
  const [weight, setWeight] = useState(initialKg === null ? '' : String(kgToDisplay(initialKg, unit)));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [retry, setRetry] = useState<LogSetInput | null>(null);
  const logs = exercise.sets.filter((set) => !set.isDeleted);

  async function save() {
    if (inFlight.current) return;
    const count = Number(reps);
    const parsed = bodyweight ? null : parseWeightInput(weight, unit);
    if (!/^\d+$/.test(reps) || count < 1 || count > 100) { setMessage('Enter 1–100 whole reps.'); return; }
    if (parsed && !parsed.ok) { setMessage(parsed.message); return; }
    const payload: LogSetInput = retry ?? (bodyweight
      ? { sessionExerciseId: entry.id, reps: count, loadMode: 'bodyweight', weightKg: null, operationId: crypto.randomUUID() }
      : { sessionExerciseId: entry.id, reps: count, loadMode: 'weighted', weightKg: parsed!.ok ? parsed!.kg : 0, operationId: crypto.randomUUID() });
    setRetry(payload);
    inFlight.current = true; setPending(true); setMessage(null);
    try {
      const result = await workoutApi(getAccessToken).logSet(payload);
      if (result.error) { setMessage(`${result.error.message} Retry the same set.`); return; }
      setRetry(null);
      setMessage(result.data.isDeleted ? 'This operation was already deleted.' : 'Set saved.');
      onSaved();
    } catch { setMessage('Could not confirm the save. Retry the same set.'); }
    finally { inFlight.current = false; setPending(false); }
  }

  return <article className="flex flex-col gap-3 rounded-lg border border-border p-4">
    <h2 className="text-xl font-semibold">{entry.exerciseNameSnapshot}</h2>
    <p>{entry.targets.targetSets} planned sets · {entry.targets.targetReps} target reps</p>
    <p className="text-sm">Prefilled from {lastPerformance ? 'your prior result for this exercise' : 'routine targets'}.</p>
    <ol aria-label="Saved sets">{logs.map((set) => <li key={set.id}>
      Set {set.ordinal}: {set.reps} reps · {formatLoad(set, entry.loadConventionSnapshot, unit)}
    </li>)}</ol>
    {active && !entry.isReplaced ? <>
      <TextField label="Actual reps" type="number" min={1} max={100} step={1} value={reps}
        disabled={pending || retry !== null} onChange={(event) => setReps(event.target.value)} />
      {!bodyweight ? <TextField label={`${loadConventionLabel(entry.loadConventionSnapshot)} (${unit})`}
        inputMode="decimal" value={weight} disabled={pending || retry !== null}
        onChange={(event) => setWeight(event.target.value)} /> : <p>Bodyweight — no added load</p>}
      <Button pending={pending} onClick={() => void save()}>{retry ? 'Retry same set' : 'Complete set'}</Button>
    </> : <p>{entry.isReplaced ? 'Replaced — original logs retained.' : 'Workout closed.'}</p>}
    {message ? <p role="status" aria-live="polite">{message}</p> : null}
  </article>;
}

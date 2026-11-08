'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ROUTINE_TEMPLATES, filterExercises, findExerciseById } from '@/features/catalog';
import type { Exercise, LoadConvention } from '@/features/catalog';

import { routinesApi } from '../api';
import type { ApiError } from '../api';
import {
  addExercise,
  draftFromRoutine,
  draftFromTemplate,
  emptyDraft,
  moveExercise,
  removeExercise,
  toRoutineInput,
  updateTargets,
} from '../routine-draft';
import type { DraftExercise, DraftTargets, RoutineDraft } from '../routine-draft';
import { ROUTINE_LIMITS } from '../types';
import { validateRoutineInput } from '../validators';
import { isSignedOut, ui } from './ui';

const LOAD_LABELS: Record<Exclude<LoadConvention, 'bodyweight'>, string> = {
  total: 'Total kg',
  per_dumbbell: 'Kg per dumbbell',
  machine: 'Machine kg',
};

/** Errors that have an input to appear beside; the rest show by the Save button. */
const FIELD_WITH_INPUT = /^(title|exercises\.\d+\.(targetSets|targetReps|targetKg|restSeconds))$/;

const newId = () => crypto.randomUUID();

function initialDraft(templateSlug: string | undefined): RoutineDraft {
  const template = ROUTINE_TEMPLATES.find((candidate) => candidate.slug === templateSlug);
  return template ? draftFromTemplate(template, newId(), newId) : emptyDraft(newId());
}

function TargetField({
  label,
  value,
  decimal = false,
  error,
  onChange,
}: {
  label: string;
  value: string;
  decimal?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={ui.input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ExerciseRow({
  row,
  index,
  total,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  row: DraftExercise;
  index: number;
  total: number;
  error: ApiError | null;
  onChange: (patch: Partial<DraftTargets>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const exercise = findExerciseById(row.exerciseId);
  const name = exercise?.name ?? 'Exercise';
  const fieldError = (field: string) =>
    error?.field === `exercises.${index}.${field}` ? error.message : undefined;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h3 className="font-semibold">
          {index + 1}. {name}
        </h3>
        {exercise ? <p className="text-sm capitalize text-muted">{exercise.equipment}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TargetField
          label="Sets"
          value={row.targetSets}
          error={fieldError('targetSets')}
          onChange={(targetSets) => onChange({ targetSets })}
        />
        <TargetField
          label="Reps"
          value={row.targetReps}
          error={fieldError('targetReps')}
          onChange={(targetReps) => onChange({ targetReps })}
        />
        {exercise && exercise.loadConvention !== 'bodyweight' ? (
          <TargetField
            label={LOAD_LABELS[exercise.loadConvention]}
            value={row.targetKg}
            decimal
            error={fieldError('targetKg')}
            onChange={(targetKg) => onChange({ targetKg })}
          />
        ) : null}
        <TargetField
          label="Rest (seconds)"
          value={row.restSeconds}
          error={fieldError('restSeconds')}
          onChange={(restSeconds) => onChange({ restSeconds })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* aria-disabled keeps keyboard focus here when a row reaches the end. */}
        <button
          type="button"
          aria-label={`Move ${name} up`}
          aria-disabled={isFirst}
          onClick={() => {
            if (!isFirst) onMove(index - 1);
          }}
          className={`${ui.button} aria-disabled:opacity-50`}
        >
          Up
        </button>
        <button
          type="button"
          aria-label={`Move ${name} down`}
          aria-disabled={isLast}
          onClick={() => {
            if (!isLast) onMove(index + 1);
          }}
          className={`${ui.button} aria-disabled:opacity-50`}
        >
          Down
        </button>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className={`${ui.button} ml-auto text-danger`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function ExercisePicker({ onPick, onClose }: { onPick: (exercise: Exercise) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const matches = useMemo(() => filterExercises({ search }), [search]);
  const id = useId();

  return (
    <section aria-label="Add an exercise" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm text-muted">
          Search exercises
        </label>
        <input
          id={id}
          type="search"
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={ui.input}
        />
      </div>
      {matches.length === 0 ? (
        <p className="text-muted">No exercises match that search.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {matches.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:border-brand"
              >
                <span className="font-semibold">{exercise.name}</span>
                <span className="text-sm capitalize text-muted">{exercise.equipment}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onClose} className={`${ui.button} self-start`}>
        Done adding
      </button>
    </section>
  );
}

function Editor({ initial }: { initial: RoutineDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleId = useId();
  const form = useRef<HTMLFormElement>(null);

  // Save sits below the list, so a bad field can be off-screen. Take the user to it.
  useEffect(() => {
    if (error) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [error]);

  const edit = (next: RoutineDraft) => {
    setDraft(next);
    setStatus('');
  };

  const move = (from: number, to: number) => {
    const name = findExerciseById(draft.exercises[from]?.exerciseId ?? '')?.name ?? 'Exercise';
    edit(moveExercise(draft, from, to));
    setStatus(`${name} moved to position ${to + 1}.`);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const checked = validateRoutineInput(toRoutineInput(draft));
    if (checked.error) {
      setError(checked.error);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await routinesApi.saveRoutine(checked.data);
    setBusy(false);

    if (result.error) {
      setError(result.error);
    } else if (draft.id) {
      setDraft(draftFromRoutine(result.data, draft.operationId));
      setStatus('Routine saved.');
    } else {
      router.replace(`/routines/${result.data.id}`);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    const result = await routinesApi.deleteRoutine(draft.id);
    if (result.error) {
      setBusy(false);
      setConfirmingDelete(false);
      setError(result.error);
    } else {
      router.replace('/routines');
    }
  };

  const titleError = error?.field === 'title' ? error.message : undefined;
  const generalError = error && !FIELD_WITH_INPUT.test(error.field ?? '') ? error : null;

  return (
    <form ref={form} onSubmit={save} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/routines" className="flex min-h-11 items-center self-start text-brand">
          Back to routines
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {draft.id ? 'Edit routine' : 'New routine'}
        </h1>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="font-semibold">
          Routine name
        </label>
        <input
          id={titleId}
          type="text"
          maxLength={ROUTINE_LIMITS.titleLength}
          value={draft.title}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${titleId}-error` : undefined}
          onChange={(event) => edit({ ...draft, title: event.target.value })}
          className={ui.input}
        />
        {titleError ? (
          <p id={`${titleId}-error`} className="text-sm text-danger">
            {titleError}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="routine-exercises" className="flex flex-col gap-3">
        <h2 id="routine-exercises" className="text-xl font-semibold">
          Exercises
        </h2>
        {draft.exercises.length === 0 ? (
          <p className="text-muted">No exercises yet. Add your first one below.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {draft.exercises.map((row, index) => (
              <ExerciseRow
                key={row.key}
                row={row}
                index={index}
                total={draft.exercises.length}
                error={error}
                onChange={(patch) => edit(updateTargets(draft, row.key, patch))}
                onMove={(to) => move(index, to)}
                onRemove={() => edit(removeExercise(draft, row.key))}
              />
            ))}
          </ol>
        )}

        {picking ? (
          <ExercisePicker
            onPick={(exercise) => edit(addExercise(draft, exercise, newId()))}
            onClose={() => setPicking(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={draft.exercises.length >= ROUTINE_LIMITS.exercises}
            className={`${ui.button} self-start disabled:opacity-60`}
          >
            Add exercise
          </button>
        )}
      </section>

      <p role="status" aria-live="polite" className="min-h-6 text-success">
        {status}
      </p>
      {generalError ? (
        <p role="alert" className="text-danger">
          {generalError.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={ui.primaryButton}>
          {busy ? 'Saving…' : 'Save routine'}
        </button>
        {draft.id ? (
          <Link href={`/schedule?routine=${draft.id}`} className={ui.button}>
            Schedule it
          </Link>
        ) : null}
        {draft.id && !confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className={`${ui.button} ml-auto text-danger`}
          >
            Delete routine
          </button>
        ) : null}
      </div>

      {confirmingDelete ? (
        <div role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-detail" className="flex flex-col gap-3 rounded-xl border border-danger p-4">
          <h2 id="delete-title" className="font-semibold">
            Delete this routine?
          </h2>
          <p id="delete-detail" className="text-muted">
            Upcoming plans for it will be canceled. Workouts you already finished stay in your
            history.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={remove} disabled={busy} className={ui.dangerButton}>
              Yes, delete it
            </button>
            <button type="button" autoFocus onClick={() => setConfirmingDelete(false)} className={ui.button}>
              Keep routine
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

export function RoutineEditor({
  routineId,
  templateSlug,
}: {
  routineId: string | null;
  templateSlug?: string;
}) {
  const [loaded, setLoaded] = useState<RoutineDraft | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [created] = useState(() => (routineId ? null : initialDraft(templateSlug)));

  useEffect(() => {
    if (!routineId) return;
    let current = true;
    void routinesApi.getRoutine(routineId).then((result) => {
      if (!current) return;
      if (result.error) setLoadError(result.error);
      else setLoaded(draftFromRoutine(result.data, newId()));
    });
    return () => {
      current = false;
    };
  }, [routineId, attempt]);

  const draft = created ?? loaded;
  if (draft) return <Editor initial={draft} />;

  if (loadError) {
    const canRetry = loadError.code !== 'routine_not_found' && loadError.code !== 'invalid_id';
    const signedOut = isSignedOut(loadError.code);
    return (
      <section role="alert" className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-bold">
          {signedOut ? 'Sign in to continue' : "We couldn't open this routine"}
        </h1>
        <p className="text-muted">{loadError.message}</p>
        {canRetry && !signedOut ? (
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setAttempt((value) => value + 1);
            }}
            className={ui.button}
          >
            Try again
          </button>
        ) : null}
        <Link href="/routines" className="flex min-h-11 items-center text-brand">
          Back to routines
        </Link>
      </section>
    );
  }

  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading routine…</span>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
    </div>
  );
}

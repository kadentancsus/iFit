'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { ui } from '@/features/planning/components/ui';
import type {
  AlternativeKind,
  AlternativeOption,
  ApiResult,
  DisplayUnit,
  Equipment,
} from '@/lib/contracts';

import {
  KIND_COPY,
  equipmentChoices,
  loadGuidance,
  withEquipment,
  type CurrentExercise,
  type LoadGuidance,
} from '../alternatives';
import { EQUIPMENT_LABELS, capitalize } from '../labels';

export interface AlternativeChoice {
  option: AlternativeOption;
  load: LoadGuidance;
}

export interface AlternativePickerProps {
  current: CurrentExercise & { id: string };
  displayUnit: DisplayUnit;
  initialKind?: AlternativeKind;
  /** Loads the options for one kind; the picker filters by equipment itself. */
  loadOptions: (kind: AlternativeKind) => Promise<ApiResult<AlternativeOption[]>>;
  /** Called once the user confirms. The caller performs the actual swap. */
  onConfirm: (choice: AlternativeChoice) => void;
  /** Keeps the current exercise. */
  onCancel: () => void;
  /** Live sessions pass these so a dead end still has a way forward. */
  onSkip?: () => void;
  onStop?: () => void;
  /** True while the caller is saving the confirmed choice. */
  busy?: boolean;
}

type Loaded = { kind: AlternativeKind; result: ApiResult<AlternativeOption[]> };

/**
 * Finds a substitute when equipment is taken, or an easier variation, and
 * confirms it with a clear note about the load. Shared by the routine editor
 * and the live workout.
 */
export function AlternativePicker({
  current,
  displayUnit,
  initialKind = 'substitution',
  loadOptions,
  onConfirm,
  onCancel,
  onSkip,
  onStop,
  busy = false,
}: AlternativePickerProps) {
  const [kind, setKind] = useState<AlternativeKind>(initialKind);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [selected, setSelected] = useState<AlternativeOption | null>(null);
  const [attempt, setAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    let active = true;
    void loadOptions(kind).then((result) => {
      if (active) setLoaded({ kind, result });
    });
    return () => {
      active = false;
    };
  }, [kind, loadOptions, attempt]);

  // Move focus with each step so screen reader and keyboard users follow along.
  useEffect(() => {
    (selected ? confirmRef : headingRef).current?.focus();
  }, [selected]);

  const switchKind = (next: AlternativeKind) => {
    setKind(next);
    setEquipment(null);
    setSelected(null);
  };

  const result = loaded?.kind === kind ? loaded.result : null;
  const options = result?.data ?? [];
  const shown = withEquipment(options, equipment);

  if (selected) {
    const load = loadGuidance(current, selected, displayUnit);
    return (
      <section aria-labelledby={`${headingId}-confirm`} className={`${ui.card} flex flex-col gap-3 border-brand`}>
        <h3 id={`${headingId}-confirm`} ref={confirmRef} tabIndex={-1} className="text-lg font-semibold">
          Switch to {selected.exercise.name}?
        </h3>
        <p className="text-muted">{selected.rationale}</p>
        <p>{load.message}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ option: selected, load })}
            className={ui.primaryButton}
          >
            {busy ? 'Switching…' : `Use ${selected.exercise.name}`}
          </button>
          <button type="button" onClick={() => setSelected(null)} className={ui.button}>
            See other options
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className={`${ui.card} flex flex-col gap-4 bg-surface-muted`}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        {KIND_COPY[kind].heading(current.name)}
      </h3>

      <div role="radiogroup" aria-label="What do you need?" className="grid grid-cols-2 gap-2">
        {(['substitution', 'regression'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => switchKind(value)}
            className={`${ui.button} aria-checked:border-brand aria-checked:bg-surface aria-checked:text-brand`}
          >
            {KIND_COPY[value].tab}
          </button>
        ))}
      </div>

      {!result ? (
        <p role="status" className="text-muted">
          Finding options…
        </p>
      ) : result.error ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>{result.error.message}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className={ui.button}>
            Try again
          </button>
        </div>
      ) : options.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p>
            {kind === 'substitution'
              ? `No swaps are listed for ${current.name}.`
              : `No easier version is listed for ${current.name}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {kind === 'substitution' ? (
              <button type="button" onClick={() => switchKind('regression')} className={ui.button}>
                Try an easier version
              </button>
            ) : (
              <button type="button" onClick={() => switchKind('substitution')} className={ui.button}>
                Try other equipment
              </button>
            )}
            {onSkip ? (
              <button type="button" onClick={onSkip} className={ui.button}>
                Skip this exercise
              </button>
            ) : null}
            {onStop ? (
              <button type="button" onClick={onStop} className={`${ui.button} text-danger`}>
                End workout here
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-muted">Show equipment</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...equipmentChoices(options)].map((value) => (
                <label
                  key={value ?? 'all'}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-surface px-4 has-checked:border-brand has-checked:font-semibold has-checked:text-brand has-focus-visible:outline-3 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name={`${headingId}-equipment`}
                    checked={equipment === value}
                    onChange={() => setEquipment(value)}
                    className="sr-only"
                  />
                  {value ? EQUIPMENT_LABELS[value] : 'Any'}
                </label>
              ))}
            </div>
          </fieldset>

          <ul className="flex flex-col gap-2">
            {shown.map((option) => (
              <li key={option.exercise.id}>
                <button
                  type="button"
                  onClick={() => setSelected(option)}
                  className="flex min-h-11 w-full flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-left hover:border-brand"
                >
                  <span className="font-semibold">{option.exercise.name}</span>
                  <span className="text-sm text-muted">
                    {EQUIPMENT_LABELS[option.exercise.equipment]} ·{' '}
                    {option.exercise.primaryMuscles.map(capitalize).join(', ')}
                  </span>
                  <span className="text-sm">{option.rationale}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" onClick={onCancel} className={`${ui.button} self-start`}>
        Keep {current.name}
      </button>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS } from '@/features/catalog';
import type { Equipment, MovementPattern } from '@/features/catalog';
import { catalogApi } from '@/features/catalog/api';
import { DIFFICULTY_LABELS, EQUIPMENT_LABELS, PATTERN_LABELS } from '@/features/catalog/labels';
import { ui } from '@/features/planning/components/ui';

export const metadata: Metadata = { title: 'Exercises' };

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

export default async function ExercisesPage({ searchParams }: PageProps<'/exercises'>) {
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search.slice(0, 80) : '';
  const pattern = pick<MovementPattern>(params.pattern, MOVEMENT_PATTERNS);
  const equipment = pick<Equipment>(params.equipment, EQUIPMENT_TYPES);
  const filtered = Boolean(search || pattern || equipment);

  const result = await catalogApi.listExercises({ search, pattern, equipment });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Exercises</h1>

      {/* A plain GET form, so filtering works before any JavaScript loads. */}
      <form role="search" className={`${ui.card} grid gap-3 sm:grid-cols-3`}>
        <div className="flex flex-col gap-1 sm:col-span-3">
          <label htmlFor="search" className="text-sm text-muted">
            Search by name
          </label>
          <input id="search" name="search" type="search" defaultValue={search} className={ui.input} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pattern" className="text-sm text-muted">
            Movement
          </label>
          <select id="pattern" name="pattern" defaultValue={pattern ?? ''} className={ui.input}>
            <option value="">Any movement</option>
            {MOVEMENT_PATTERNS.map((value) => (
              <option key={value} value={value}>
                {PATTERN_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="equipment" className="text-sm text-muted">
            Equipment
          </label>
          <select id="equipment" name="equipment" defaultValue={equipment ?? ''} className={ui.input}>
            <option value="">Any equipment</option>
            {EQUIPMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {EQUIPMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={ui.primaryButton}>
            Show
          </button>
          {filtered ? (
            <Link href="/exercises" className={ui.button}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {result.error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>{result.error.message}</p>
          <Link href="/exercises" className={ui.button}>
            Try again
          </Link>
        </div>
      ) : result.data.length === 0 ? (
        <p className="text-muted">No exercises match. Try fewer filters.</p>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {result.data.length} {result.data.length === 1 ? 'exercise' : 'exercises'}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.data.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  href={`/exercises/${exercise.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface hover:border-brand"
                >
                  {/* Decorative here: the name below says what it is. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
                  <img src={exercise.assetPath} alt="" width={480} height={300} className="h-auto w-full" />
                  <span className="flex flex-col gap-1 p-4">
                    <span className="font-semibold">{exercise.name}</span>
                    <span className="text-sm text-muted">
                      {EQUIPMENT_LABELS[exercise.equipment]} · {PATTERN_LABELS[exercise.pattern]} ·{' '}
                      {DIFFICULTY_LABELS[exercise.difficulty]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

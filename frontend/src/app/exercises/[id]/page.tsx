import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { STOP_IF_PAIN } from '@/features/catalog';
import { catalogApi } from '@/features/catalog/api';
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  PATTERN_LABELS,
  capitalize,
} from '@/features/catalog/labels';
import { ui } from '@/features/planning/components/ui';

// One request per page view, shared by the title and the page.
const loadExercise = cache((id: string) => catalogApi.getExercise(id));

export async function generateMetadata({ params }: PageProps<'/exercises/[id]'>): Promise<Metadata> {
  const result = await loadExercise((await params).id);
  return { title: result.data?.name ?? 'Exercise' };
}

export default async function ExercisePage({ params }: PageProps<'/exercises/[id]'>) {
  const result = await loadExercise((await params).id);
  if (result.error?.code === 'exercise_not_found') notFound();

  if (result.error) {
    return (
      <section role="alert" className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-bold">We couldn&apos;t load this exercise</h1>
        <p className="text-muted">{result.error.message}</p>
        <Link href="/exercises" className={ui.link}>
          Back to exercises
        </Link>
      </section>
    );
  }

  const exercise = result.data;
  const muscles = [
    ...exercise.primaryMuscles.map((muscle) => ({ muscle, main: true })),
    ...exercise.secondaryMuscles.map((muscle) => ({ muscle, main: false })),
  ];

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/exercises" className={ui.link}>
          Back to exercises
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{exercise.name}</h1>
        <p className="text-muted">
          {EQUIPMENT_LABELS[exercise.equipment]} · {PATTERN_LABELS[exercise.pattern]} ·{' '}
          {DIFFICULTY_LABELS[exercise.difficulty]}
        </p>
      </div>

      {/* The looping demo plays only when the user hasn't asked for less motion. */}
      <picture>
        <source srcSet={exercise.motionAssetPath} media="(prefers-reduced-motion: no-preference)" />
        <img
          src={exercise.assetPath}
          alt={exercise.assetAlt}
          width={480}
          height={300}
          className="h-auto w-full rounded-xl"
        />
      </picture>

      <p className="text-lg">{exercise.summary}</p>

      <section aria-labelledby="cues-title" className={`${ui.card} flex flex-col gap-3 border-brand`}>
        <h2 id="cues-title" className="text-xl font-semibold">
          Form cues
        </h2>
        <ul className="flex flex-col gap-2">
          {exercise.cues.map((cue) => (
            <li key={cue} className="flex gap-3 text-lg font-semibold">
              <span aria-hidden="true" className="text-brand">
                ✓
              </span>
              {cue}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title" className="flex flex-col gap-3">
        <h2 id="steps-title" className="text-xl font-semibold">
          How to do it
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-6">
          {exercise.instructions.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="mistakes-title" className="flex flex-col gap-3">
        <h2 id="mistakes-title" className="text-xl font-semibold">
          Common mistakes
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-6">
          {exercise.mistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="muscles-title" className="flex flex-col gap-3">
        <h2 id="muscles-title" className="text-xl font-semibold">
          Muscles worked
        </h2>
        <ul className="flex flex-wrap gap-2">
          {muscles.map(({ muscle, main }) => (
            <li
              key={muscle}
              className={`rounded-full border px-3 py-1 text-sm ${main ? 'border-brand font-semibold' : 'border-border text-muted'}`}
            >
              {capitalize(muscle)}
              <span className="sr-only">{main ? ' (main)' : ' (also)'}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside aria-labelledby="pain-title" className="rounded-xl border border-warning p-4">
        <h2 id="pain-title" className="font-semibold">
          {STOP_IF_PAIN.prompt}
        </h2>
        <p className="mt-1 text-muted">{STOP_IF_PAIN.message}</p>
      </aside>
    </article>
  );
}

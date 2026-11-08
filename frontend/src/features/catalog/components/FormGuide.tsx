'use client';

import { useEffect, useId, useRef } from 'react';

import { ui } from '@/features/planning/components/ui';
import type { Exercise } from '@/lib/contracts';

import { STOP_IF_PAIN } from '../guidance';

export interface FormGuideProps {
  exercise: Pick<Exercise, 'name' | 'cues' | 'mistakes' | 'assetPath' | 'motionAssetPath' | 'assetAlt'>;
  /** Returns to the workout exactly as it was. */
  onClose: () => void;
  onTryEasier?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
}

/**
 * The "check form" panel for a live workout. It holds no workout state, so
 * opening and closing it can't lose anything; the caller owns every action.
 */
export function FormGuide({ exercise, onClose, onTryEasier, onSkip, onStop }: FormGuideProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className={`${ui.card} flex flex-col gap-4`}
    >
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        {exercise.name}: form check
      </h3>

      <picture>
        <source srcSet={exercise.motionAssetPath} media="(prefers-reduced-motion: no-preference)" />
        <img src={exercise.assetPath} alt={exercise.assetAlt} width={480} height={300} className="h-auto w-full rounded-lg" />
      </picture>

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

      <div>
        <h4 className="font-semibold">Watch out for</h4>
        <ul className="list-disc pl-6 text-muted">
          {exercise.mistakes.map((mistake) => (
            <li key={mistake}>{mistake}</li>
          ))}
        </ul>
      </div>

      <div role="note" className="rounded-lg border border-warning p-3">
        <p className="font-semibold">{STOP_IF_PAIN.prompt}</p>
        <p className="text-muted">{STOP_IF_PAIN.message}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className={ui.primaryButton}>
          Back to workout
        </button>
        {onTryEasier ? (
          <button type="button" onClick={onTryEasier} className={ui.button}>
            Try an easier version
          </button>
        ) : null}
        {onSkip ? (
          <button type="button" onClick={onSkip} className={ui.button}>
            Skip exercise
          </button>
        ) : null}
        {onStop ? (
          <button type="button" onClick={onStop} className={`${ui.button} text-danger`}>
            End workout
          </button>
        ) : null}
      </div>
    </section>
  );
}

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  EXERCISES,
  EXERCISE_ALTERNATIVES,
  MOVEMENT_PATTERNS,
  ROUTINE_TEMPLATES,
  STOP_IF_PAIN,
  alternativeEquipment,
  filterExercises,
  findAlternatives,
  findExerciseById,
  findExerciseBySlug,
} from './index';
import type { Exercise } from './index';
import { renderCatalogSeed } from './seed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const projectFile = (path: string) => new URL(`../../../${path}`, import.meta.url);

const exercise = (slug: string): Exercise => {
  const found = findExerciseBySlug(slug);
  if (!found) throw new Error(`Missing exercise: ${slug}`);
  return found;
};

const names = (options: { exercise: Exercise }[]) => options.map((option) => option.exercise.name);

describe('exercise catalog', () => {
  it('covers every movement pattern with at least 12 exercises', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(EXERCISES.map(({ pattern }) => pattern))).toEqual(new Set(MOVEMENT_PATTERNS));
  });

  it('gives each exercise a unique, valid identity', () => {
    for (const key of ['id', 'slug', 'name'] as const) {
      expect(new Set(EXERCISES.map((entry) => entry[key])).size).toBe(EXERCISES.length);
    }
    for (const { id } of EXERCISES) expect(id).toMatch(UUID);
  });

  it.each(EXERCISES.map((entry) => [entry.slug, entry] as const))(
    '%s has complete guidance',
    (_slug, entry) => {
      expect(entry.primaryMuscles.length).toBeGreaterThan(0);
      expect(entry.instructions.length).toBeGreaterThanOrEqual(3);
      expect(entry.cues).toHaveLength(3);
      expect(entry.mistakes.length).toBeGreaterThanOrEqual(2);
      expect(entry.summary).not.toBe('');
      expect(entry.assetAlt).not.toBe('');
      for (const cue of entry.cues) expect(cue.length).toBeLessThanOrEqual(36);
    },
  );

  it.each(EXERCISES.map((entry) => [entry.slug, entry] as const))(
    '%s has local demonstration files',
    (_slug, entry) => {
      expect(existsSync(projectFile(`public${entry.assetPath}`))).toBe(true);
      expect(existsSync(projectFile(`public${entry.motionAssetPath}`))).toBe(true);
    },
  );

  it('animates the motion files but not the reduced-motion files', () => {
    for (const entry of EXERCISES) {
      expect(readFileSync(projectFile(`public${entry.assetPath}`), 'utf8')).not.toContain('<animate');
      expect(readFileSync(projectFile(`public${entry.motionAssetPath}`), 'utf8')).toContain(
        '<animate',
      );
    }
  });

  it('keeps load conventions consistent with equipment', () => {
    for (const entry of EXERCISES) {
      expect(entry.loadConvention === 'bodyweight', entry.slug).toBe(
        entry.equipment === 'bodyweight',
      );
      if (entry.equipment === 'barbell') expect(entry.loadConvention, entry.slug).toBe('total');
      if (entry.equipment === 'machine' || entry.equipment === 'cable') {
        expect(entry.loadConvention, entry.slug).toBe('machine');
      }
    }
  });

  it('counts a goblet squat as one weight, not a pair', () => {
    expect(exercise('goblet-squat').loadConvention).toBe('total');
    expect(exercise('dumbbell-flat-bench-press').loadConvention).toBe('per_dumbbell');
  });
});

describe('curated alternatives', () => {
  const describePair = (sourceId: string, targetId: string) =>
    `${findExerciseById(sourceId)?.slug} -> ${findExerciseById(targetId)?.slug}`;

  it('only links exercises that exist, and never an exercise to itself', () => {
    for (const { sourceExerciseId, targetExerciseId } of EXERCISE_ALTERNATIVES) {
      expect(findExerciseById(sourceExerciseId)).toBeDefined();
      expect(findExerciseById(targetExerciseId)).toBeDefined();
      expect(sourceExerciseId).not.toBe(targetExerciseId);
    }
  });

  it('has no duplicate suggestions', () => {
    const keys = EXERCISE_ALTERNATIVES.map(
      ({ sourceExerciseId, targetExerciseId, kind }) =>
        `${sourceExerciseId}:${targetExerciseId}:${kind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers every exercise two substitutions, including a way off the taken equipment', () => {
    for (const { id, slug, equipment } of EXERCISES) {
      const otherEquipment = alternativeEquipment(id, 'substitution').filter(
        (option) => option !== equipment,
      );

      expect(findAlternatives(id, 'substitution').length, slug).toBeGreaterThanOrEqual(2);
      expect(otherEquipment.length, slug).toBeGreaterThanOrEqual(1);
    }
  });

  it('substitutes within the same movement pattern and shared muscles', () => {
    for (const alternative of EXERCISE_ALTERNATIVES) {
      if (alternative.kind !== 'substitution') continue;
      const source = findExerciseById(alternative.sourceExerciseId) as Exercise;
      const target = findExerciseById(alternative.targetExerciseId) as Exercise;
      const pair = describePair(source.id, target.id);

      expect(target.pattern, pair).toBe(source.pattern);
      expect(
        source.primaryMuscles.some((muscle) => target.primaryMuscles.includes(muscle)),
        pair,
      ).toBe(true);
    }
  });

  it('only calls a variation a regression when it is easier', () => {
    for (const alternative of EXERCISE_ALTERNATIVES) {
      if (alternative.kind !== 'regression') continue;
      const source = findExerciseById(alternative.sourceExerciseId) as Exercise;
      const target = findExerciseById(alternative.targetExerciseId) as Exercise;

      expect(target.difficulty, describePair(source.id, target.id)).toBeLessThan(source.difficulty);
    }
  });

  it('gives every hardest exercise an easier variation', () => {
    for (const { id, slug, difficulty } of EXERCISES) {
      if (difficulty === 3) {
        expect(findAlternatives(id, 'regression').length, slug).toBeGreaterThan(0);
      }
    }
  });

  it('flags a substitution that is harder than the planned exercise', () => {
    for (const alternative of EXERCISE_ALTERNATIVES) {
      if (alternative.kind !== 'substitution') continue;
      const source = findExerciseById(alternative.sourceExerciseId) as Exercise;
      const target = findExerciseById(alternative.targetExerciseId) as Exercise;

      if (target.difficulty - source.difficulty >= 2) {
        expect(alternative.rationale, describePair(source.id, target.id)).toContain('harder');
      }
    }
  });

  it('supports the design report scenarios', () => {
    expect(
      names(findAlternatives(exercise('barbell-incline-bench-press').id, 'substitution')),
    ).toEqual(
      expect.arrayContaining([
        'Dumbbell Flat Bench Press',
        'Chest Press Machine',
        'Incline Push-Up',
      ]),
    );
    expect(names(findAlternatives(exercise('barbell-back-squat').id, 'regression'))).toEqual([
      'Goblet Squat',
      'Leg Press',
    ]);
  });
});

describe('safety copy', () => {
  // Guidance must not diagnose injuries or promise that a variation removes pain.
  const FORBIDDEN = [
    /pain[- ]free/i,
    /no pain/i,
    /without pain/i,
    /zero pain/i,
    /eliminat/i,
    /prevents? injur/i,
    /injury[- ]proof/i,
    /guarantee/i,
    /\bcures?\b/i,
    /\bheals?\b/i,
    /\bsafe(r|st)?\b/i,
    /you (have|may have|might have) (a|an) /i,
  ];

  const allCopy = [
    ...EXERCISES.flatMap((entry) => [
      entry.summary,
      entry.assetAlt,
      ...entry.instructions,
      ...entry.cues,
      ...entry.mistakes,
    ]),
    ...EXERCISE_ALTERNATIVES.map(({ rationale }) => rationale),
    STOP_IF_PAIN.prompt,
    STOP_IF_PAIN.message,
  ];

  it('never makes a medical promise', () => {
    for (const copy of allCopy) {
      for (const pattern of FORBIDDEN) expect(copy).not.toMatch(pattern);
    }
  });

  it('tells the user to stop and leaves the decision with them', () => {
    expect(STOP_IF_PAIN.message).toMatch(/stop/i);
    expect(STOP_IF_PAIN.message).toMatch(/easier variation/i);
    expect(STOP_IF_PAIN.message).toMatch(/skip/i);
  });
});

describe('filterExercises', () => {
  it('returns the whole catalog with no filters', () => {
    expect(filterExercises()).toHaveLength(EXERCISES.length);
  });

  it('searches names without regard to case or spacing', () => {
    expect(filterExercises({ search: '  GOBLET ' }).map(({ slug }) => slug)).toEqual([
      'goblet-squat',
    ]);
  });

  it('combines filters', () => {
    const results = filterExercises({ pattern: 'push', equipment: 'machine' });

    expect(results.map(({ slug }) => slug)).toEqual([
      'chest-press-machine',
      'machine-shoulder-press',
    ]);
  });

  it('matches primary and secondary muscles', () => {
    const slugs = filterExercises({ muscle: 'triceps' }).map(({ slug }) => slug);

    expect(slugs).toContain('barbell-bench-press');
    expect(slugs).not.toContain('leg-press');
  });

  it('returns nothing when no exercise matches', () => {
    expect(filterExercises({ search: 'zzz' })).toEqual([]);
  });
});

describe('findAlternatives', () => {
  const benchId = exercise('barbell-incline-bench-press').id;

  it('returns options in curated order', () => {
    const positions = findAlternatives(benchId, 'substitution').map(({ position }) => position);

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBe(0);
  });

  it('filters by equipment', () => {
    expect(names(findAlternatives(benchId, 'substitution', 'machine'))).toEqual([
      'Chest Press Machine',
    ]);
  });

  it('returns an empty list when no option matches, so the UI can offer recovery', () => {
    expect(findAlternatives(benchId, 'substitution', 'cable')).toEqual([]);
  });

  it('returns an empty list for an unknown exercise', () => {
    expect(findAlternatives('00000000-0000-4000-8000-000000000000', 'substitution')).toEqual([]);
  });

  it('only offers equipment chips that lead to at least one option', () => {
    for (const equipment of alternativeEquipment(benchId, 'substitution')) {
      expect(findAlternatives(benchId, 'substitution', equipment).length).toBeGreaterThan(0);
    }
    expect(alternativeEquipment(benchId, 'substitution')).not.toContain('cable');
  });
});

describe('starter templates', () => {
  it('use unique IDs and slugs', () => {
    expect(new Set(ROUTINE_TEMPLATES.map(({ id }) => id)).size).toBe(ROUTINE_TEMPLATES.length);
    expect(new Set(ROUTINE_TEMPLATES.map(({ slug }) => slug)).size).toBe(ROUTINE_TEMPLATES.length);
    for (const { id } of ROUTINE_TEMPLATES) expect(id).toMatch(UUID);
  });

  it('reference real exercises with valid targets', () => {
    for (const template of ROUTINE_TEMPLATES) {
      expect(template.exercises.length).toBeGreaterThan(0);

      for (const planned of template.exercises) {
        expect(findExerciseBySlug(planned.exerciseSlug), planned.exerciseSlug).toBeDefined();
        expect(planned.targetSets).toBeGreaterThanOrEqual(1);
        expect(planned.targetReps).toBeGreaterThanOrEqual(1);
        expect(planned.restSeconds).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('catalog seed', () => {
  const seed = renderCatalogSeed();

  it('matches the committed seed file', () => {
    expect(readFileSync(projectFile('supabase/seed.sql'), 'utf8')).toBe(seed);
  });

  it('includes every exercise', () => {
    for (const { id } of EXERCISES) expect(seed).toContain(`'${id}'::uuid`);
  });

  it('only writes to public catalog tables', () => {
    const written = [...seed.matchAll(/^(?:insert into|delete from) (\S+)/gm)].map(
      (match) => match[1],
    );

    expect(new Set(written)).toEqual(
      new Set([
        'public.exercises',
        'public.exercise_alternatives',
        'public.routine_templates',
        'public.routine_template_exercises',
      ]),
    );
  });

  it('never deletes exercises, which user records depend on', () => {
    expect(seed).not.toMatch(/delete from public\.exercises\b/);
  });

  it('upserts every insert so it can be re-run', () => {
    const inserts = seed.match(/^insert into /gm) ?? [];
    const upserts = seed.match(/^on conflict /gm) ?? [];

    expect(upserts.length).toBe(inserts.length);
  });
});

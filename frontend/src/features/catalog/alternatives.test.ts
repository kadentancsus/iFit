import { describe, expect, it } from 'vitest';

import type { AlternativeOption, Exercise, LastPerformance } from '@/lib/contracts';

import {
  EXERCISE_ALTERNATIVES,
  findAlternatives,
  findExerciseById,
  findExerciseBySlug,
} from './index';
import {
  equipmentChoices,
  loadGuidance,
  withEquipment,
  type CurrentExercise,
} from './alternatives';

const exercise = (slug: string): Exercise => findExerciseBySlug(slug)! as Exercise;

const option = (slug: string, lastPerformance: LastPerformance | null = null): AlternativeOption => ({
  kind: 'substitution',
  rationale: 'Because.',
  position: 0,
  exercise: exercise(slug),
  lastPerformance,
});

const bench: CurrentExercise = {
  name: 'Barbell Bench Press',
  equipment: 'barbell',
  loadConvention: 'total',
  targetKg: 60,
};

const weighted = (weightKg: number): LastPerformance => ({
  reps: 10,
  weightKg,
  loadMode: 'weighted',
  completedAt: '2026-11-01T10:00:00Z',
});

describe('load guidance when switching exercises', () => {
  it('never carries the barbell load over to dumbbells', () => {
    const guidance = loadGuidance(bench, option('dumbbell-flat-bench-press'), 'kg');

    expect(guidance.mode).toBe('enter');
    expect(guidance.message).toContain('60 kg on Barbell Bench Press doesn’t carry over');
    expect(guidance.message).toContain('one hand at a time');
    expect(guidance).not.toHaveProperty('kg');
  });

  it('explains machines separately', () => {
    const guidance = loadGuidance(bench, option('chest-press-machine'), 'lb');

    expect(guidance.message).toContain('132.3 lb');
    expect(guidance.message).toContain('machine stacks');
  });

  it('prefills only from the user’s own history with that alternative', () => {
    const guidance = loadGuidance(bench, option('dumbbell-flat-bench-press', weighted(22.5)), 'kg');

    expect(guidance).toEqual({
      mode: 'prior',
      kg: 22.5,
      message: 'Prefilled with 22.5 kg each, from your last Dumbbell Flat Bench Press set.',
    });
  });

  it('sets no weight for bodyweight alternatives, even with history', () => {
    const guidance = loadGuidance(bench, option('push-up', weighted(10)), 'kg');

    expect(guidance.mode).toBe('bodyweight');
    expect(guidance.message).toContain('no weight to set');
  });

  it('asks for a weight when nothing was planned or logged', () => {
    const guidance = loadGuidance(
      { ...bench, targetKg: null },
      option('chest-press-machine'),
      'kg',
    );

    expect(guidance).toEqual({
      mode: 'enter',
      message: 'You haven’t logged Chest Press Machine yet. Choose a weight you can control for every rep.',
    });
  });

  it.each(
    EXERCISE_ALTERNATIVES.map((alt) => {
      const source = findExerciseById(alt.sourceExerciseId)!;
      const target = findExerciseById(alt.targetExerciseId)!;
      return [`${source.name} → ${target.name} (${alt.kind})`, source, target] as const;
    }),
  )('never mentions pain or safety: %s', (_pair, source, target) => {
    for (const lastPerformance of [null, weighted(20)]) {
      const message = loadGuidance(
        { ...source, targetKg: 40 },
        { ...option(target.slug, lastPerformance) },
        'kg',
      ).message;

      expect(message).not.toMatch(/pain|injur|safe|heal|prevent/i);
    }
  });
});

describe('equipment filtering', () => {
  const options = findAlternatives(exercise('barbell-bench-press').id, 'substitution').map((alt) =>
    option(alt.exercise.slug),
  );

  it('offers only equipment that has an option, in suggestion order', () => {
    expect(equipmentChoices(options)).toEqual(['dumbbell', 'machine', 'bodyweight']);
  });

  it('filters to the chosen equipment, or shows all', () => {
    expect(withEquipment(options, 'machine').map((o) => o.exercise.slug)).toEqual(['chest-press-machine']);
    expect(withEquipment(options, null)).toHaveLength(3);
  });
});

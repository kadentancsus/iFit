import type { AlternativeKind, ExerciseAlternative } from '../types';
import { EXERCISES } from './exercises';

type Suggestion = readonly [targetSlug: string, rationale: string];

interface CuratedOptions {
  /** Trains the same pattern when the planned equipment is taken. */
  substitutions: readonly Suggestion[];
  /** Easier variations, listed easiest-to-reach first. */
  regressions?: readonly Suggestion[];
}

/**
 * Curated by hand rather than computed, so that every suggestion has a reason a
 * beginner can read. Rationale copy explains the difference between movements;
 * it must never promise that a variation removes or prevents pain.
 */
const CURATED: Readonly<Record<string, CuratedOptions>> = {
  'barbell-bench-press': {
    substitutions: [
      ['dumbbell-flat-bench-press', 'Same flat press, with each arm working on its own.'],
      ['chest-press-machine', 'Same chest work on a guided path, and quick to set up.'],
      ['push-up', 'Same pressing pattern with no equipment to wait for.'],
    ],
    regressions: [
      ['chest-press-machine', 'The machine guides the path, so there is no bar to balance.'],
      ['incline-push-up', 'Hands on a bench lighten the load, and you set the angle.'],
    ],
  },
  'barbell-incline-bench-press': {
    substitutions: [
      ['incline-dumbbell-press', 'Same incline and upper-chest focus, using dumbbells.'],
      ['dumbbell-flat-bench-press', 'Keeps the press, with a little less upper-chest emphasis.'],
      ['chest-press-machine', 'Same pressing muscles without needing a free bench.'],
      ['incline-push-up', 'Keeps the press going on any stable bench or box.'],
    ],
    regressions: [
      ['chest-press-machine', 'The machine guides the path, so there is no bar to balance.'],
      ['incline-push-up', 'Hands on a bench lighten the load, and you set the angle.'],
    ],
  },
  'dumbbell-flat-bench-press': {
    substitutions: [
      ['chest-press-machine', 'Same chest work without carrying dumbbells to a bench.'],
      ['barbell-bench-press', 'Same flat press with a bar, if a rack is free.'],
      ['push-up', 'Same pressing pattern with no equipment to wait for.'],
    ],
    regressions: [
      ['chest-press-machine', 'The machine guides the path, so each arm has less to steady.'],
      ['incline-push-up', 'Hands on a bench lighten the load, and you set the angle.'],
    ],
  },
  'incline-dumbbell-press': {
    substitutions: [
      ['barbell-incline-bench-press', 'Same incline press with a bar, if a rack is free.'],
      ['dumbbell-flat-bench-press', 'Uses the same dumbbells on any flat bench.'],
      ['chest-press-machine', 'Same pressing muscles without needing a free bench.'],
    ],
    regressions: [
      ['chest-press-machine', 'The machine guides the path, so each arm has less to steady.'],
      ['incline-push-up', 'Hands on a bench lighten the load, and you set the angle.'],
    ],
  },
  'chest-press-machine': {
    substitutions: [
      ['dumbbell-flat-bench-press', 'Same chest work if a bench and dumbbells are free.'],
      ['push-up', 'Same pressing pattern with no equipment to wait for.'],
      ['barbell-bench-press', 'Same flat press with a bar, if a rack is free. This one is harder.'],
    ],
  },
  'push-up': {
    substitutions: [
      ['chest-press-machine', 'Same pressing muscles with a load you can set exactly.'],
      ['dumbbell-flat-bench-press', 'Same pressing pattern with a load you choose.'],
    ],
    regressions: [['incline-push-up', 'Raising your hands lightens the share of bodyweight.']],
  },
  'incline-push-up': {
    substitutions: [
      ['chest-press-machine', 'Same pressing muscles with a load you can set exactly.'],
      ['push-up', 'Same movement on the floor if no bench is free. This one is harder.'],
    ],
  },
  'seated-dumbbell-shoulder-press': {
    substitutions: [
      ['machine-shoulder-press', 'Same overhead press on a guided path.'],
      ['barbell-overhead-press', 'Same overhead press standing with a bar. This one is harder.'],
    ],
    regressions: [
      ['machine-shoulder-press', 'The machine guides the path, so each arm has less to steady.'],
    ],
  },
  'machine-shoulder-press': {
    substitutions: [
      ['seated-dumbbell-shoulder-press', 'Same overhead press if a bench and dumbbells are free.'],
      ['barbell-overhead-press', 'Same overhead press standing with a bar. This one is harder.'],
    ],
  },
  'barbell-overhead-press': {
    substitutions: [
      ['seated-dumbbell-shoulder-press', 'Same overhead press from a supported seat.'],
      ['machine-shoulder-press', 'Same overhead press on a guided path.'],
    ],
    regressions: [
      ['machine-shoulder-press', 'The seat and guided path take the balance out of the lift.'],
      ['seated-dumbbell-shoulder-press', 'The back pad supports you while you press.'],
    ],
  },
  'lat-pulldown': {
    substitutions: [
      ['seated-cable-row', 'Another cable pull for your back, from a different angle.'],
      ['machine-row', 'Same back muscles with your chest supported.'],
      ['one-arm-dumbbell-row', 'Same back muscles with one dumbbell and a bench.'],
      ['pull-up', 'The same overhead pull using your bodyweight. This one is harder.'],
    ],
  },
  'seated-cable-row': {
    substitutions: [
      ['machine-row', 'Same row with your chest supported.'],
      ['one-arm-dumbbell-row', 'Same row with one dumbbell and a bench.'],
      ['inverted-row', 'Same row using a fixed bar and your bodyweight.'],
    ],
  },
  'one-arm-dumbbell-row': {
    substitutions: [
      ['seated-cable-row', 'Same row with both arms and a steady cable.'],
      ['machine-row', 'Same row with your chest supported.'],
    ],
    regressions: [['machine-row', 'The chest pad holds your position, so you can just pull.']],
  },
  'machine-row': {
    substitutions: [
      ['seated-cable-row', 'Same row using a cable station.'],
      ['one-arm-dumbbell-row', 'Same row with one dumbbell and a bench.'],
    ],
  },
  'inverted-row': {
    substitutions: [
      ['seated-cable-row', 'Same row with a load you can set exactly.'],
      ['one-arm-dumbbell-row', 'Same row with one dumbbell and a bench.'],
    ],
    regressions: [['machine-row', 'The chest pad holds your position, and you set the load.']],
  },
  'pull-up': {
    substitutions: [
      ['lat-pulldown', 'The same overhead pull with a load you can set.'],
      ['inverted-row', 'A bodyweight pull with your feet on the floor.'],
    ],
    regressions: [
      ['lat-pulldown', 'You choose the load instead of lifting your full bodyweight.'],
      ['inverted-row', 'Your feet stay down, so you lift only part of your bodyweight.'],
    ],
  },
  'barbell-back-squat': {
    substitutions: [
      ['leg-press', 'Same leg muscles with your back supported.'],
      ['goblet-squat', 'Same squat using one weight, with no rack needed.'],
      ['dumbbell-split-squat', 'Same leg muscles, one side at a time, with dumbbells.'],
    ],
    regressions: [
      ['goblet-squat', 'Holding the weight in front helps you stay upright and control depth.'],
      ['leg-press', 'The seat supports your back while you control the range.'],
    ],
  },
  'goblet-squat': {
    substitutions: [
      ['leg-press', 'Same leg muscles with your back supported.'],
      ['dumbbell-split-squat', 'Same leg muscles, one side at a time.'],
      ['box-squat', 'Same squat with no weight to find.'],
    ],
    regressions: [
      ['box-squat', 'The box sets your depth, and there is no weight to hold.'],
      ['leg-press', 'The seat supports your back while you control the range.'],
    ],
  },
  'leg-press': {
    substitutions: [
      ['goblet-squat', 'Same leg muscles with one dumbbell or kettlebell.'],
      ['dumbbell-split-squat', 'Same leg muscles, one side at a time.'],
      ['box-squat', 'Same leg muscles with no equipment to wait for.'],
    ],
  },
  'box-squat': {
    substitutions: [
      ['leg-press', 'Same leg muscles with a load you can set exactly.'],
      ['goblet-squat', 'Same squat with a weight added. This one is harder.'],
    ],
  },
  'dumbbell-split-squat': {
    substitutions: [
      ['goblet-squat', 'Same leg muscles with both feet side by side.'],
      ['leg-press', 'Same leg muscles with your back supported.'],
    ],
    regressions: [['box-squat', 'Both feet stay planted, and the box sets your depth.']],
  },
  'barbell-romanian-deadlift': {
    substitutions: [
      ['dumbbell-romanian-deadlift', 'Same hinge with dumbbells instead of a bar.'],
      ['cable-pull-through', 'Same hinge, with the cable pulling your hips back.'],
      ['seated-leg-curl', 'Works your hamstrings directly, without the hinge.'],
    ],
    regressions: [
      ['dumbbell-romanian-deadlift', 'Lighter jumps and easier setup, using the same movement.'],
      ['glute-bridge', 'Works the same muscles from the floor with no load to hold.'],
    ],
  },
  'dumbbell-romanian-deadlift': {
    substitutions: [
      ['barbell-romanian-deadlift', 'Same hinge with a bar. This one is harder.'],
      ['cable-pull-through', 'Same hinge, with the cable pulling your hips back.'],
      ['seated-leg-curl', 'Works your hamstrings directly, without the hinge.'],
    ],
    regressions: [['glute-bridge', 'Works the same muscles from the floor with no load to hold.']],
  },
  'seated-leg-curl': {
    substitutions: [
      ['dumbbell-romanian-deadlift', 'Works your hamstrings through a hip hinge.'],
      ['glute-bridge', 'Works the back of your legs with no equipment.'],
    ],
  },
  'glute-bridge': {
    substitutions: [
      ['seated-leg-curl', 'Works the back of your legs with a load you can set.'],
      ['cable-pull-through', 'Same hip drive from standing, with a load you can set.'],
    ],
  },
  'cable-pull-through': {
    substitutions: [
      ['dumbbell-romanian-deadlift', 'Same hinge with dumbbells instead of a cable.'],
      ['glute-bridge', 'Same hip drive from the floor with no equipment.'],
    ],
    regressions: [['glute-bridge', 'Same hip drive from the floor, with nothing to balance.']],
  },
  'dead-bug': {
    substitutions: [
      ['bird-dog', 'Same steady-trunk work on your hands and knees.'],
      ['pallof-press', 'Same steady-trunk work standing, with a cable.'],
    ],
  },
  'bird-dog': {
    substitutions: [
      ['dead-bug', 'Same steady-trunk work on your back.'],
      ['pallof-press', 'Same steady-trunk work standing, with a cable.'],
    ],
  },
  'pallof-press': {
    substitutions: [
      ['dead-bug', 'Same steady-trunk work with no cable needed.'],
      ['bird-dog', 'Same steady-trunk work with no cable needed.'],
    ],
    regressions: [['dead-bug', 'The floor supports you, and there is no load to resist.']],
  },
  'hanging-knee-raise': {
    substitutions: [
      ['dead-bug', 'Works your core from the floor, with no bar needed.'],
      ['pallof-press', 'Works your core standing, with a cable.'],
    ],
    regressions: [['dead-bug', 'The floor supports you, and your grip is not a limit.']],
  },
};

const idForSlug = (slug: string): string => {
  const exercise = EXERCISES.find((candidate) => candidate.slug === slug);
  if (!exercise) throw new Error(`Unknown exercise slug in alternatives: ${slug}`);
  return exercise.id;
};

const toAlternatives = (
  sourceSlug: string,
  kind: AlternativeKind,
  suggestions: readonly Suggestion[] = [],
): ExerciseAlternative[] =>
  suggestions.map(([targetSlug, rationale], position) => ({
    sourceExerciseId: idForSlug(sourceSlug),
    targetExerciseId: idForSlug(targetSlug),
    kind,
    rationale,
    position,
  }));

export const EXERCISE_ALTERNATIVES: readonly ExerciseAlternative[] = Object.entries(CURATED).flatMap(
  ([sourceSlug, options]) => [
    ...toAlternatives(sourceSlug, 'substitution', options.substitutions),
    ...toAlternatives(sourceSlug, 'regression', options.regressions),
  ],
);

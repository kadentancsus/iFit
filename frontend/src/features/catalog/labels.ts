import type { Difficulty, Equipment, MovementPattern } from './types';

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  push: 'Push',
  pull: 'Pull',
  squat: 'Squat',
  hinge: 'Hinge',
  core: 'Core',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'Easy to learn',
  2: 'Some practice',
  3: 'Most technique',
};

/** Muscle names are stored lowercase; this is for headings and badges. */
export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

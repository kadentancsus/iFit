import type {
  AlternativeKind,
  AlternativeOption,
  DisplayUnit,
  Equipment,
  LoadConvention,
} from '@/lib/contracts';
import { formatLoad } from '@/lib/units';

/** What the user is replacing, and what it was planned at. */
export interface CurrentExercise {
  name: string;
  equipment: Equipment;
  loadConvention: LoadConvention;
  /** Planned load in canonical kilograms, if any. */
  targetKg: number | null;
}

export type LoadGuidance =
  | { mode: 'bodyweight'; message: string }
  | { mode: 'prior'; kg: number; message: string }
  | { mode: 'enter'; message: string };

export const KIND_COPY: Record<AlternativeKind, { tab: string; heading: (name: string) => string }> = {
  substitution: { tab: 'Equipment taken', heading: (name) => `Swap ${name}` },
  regression: { tab: 'Easier version', heading: (name) => `Easier than ${name}` },
};

/** Equipment present in these options, in first-seen order. */
export const equipmentChoices = (options: readonly AlternativeOption[]): Equipment[] => [
  ...new Set(options.map((option) => option.exercise.equipment)),
];

export const withEquipment = (
  options: readonly AlternativeOption[],
  equipment: Equipment | null,
): AlternativeOption[] =>
  options.filter((option) => equipment === null || option.exercise.equipment === equipment);

function whyNotCarried(from: LoadConvention, to: LoadConvention): string {
  if (to === 'per_dumbbell') return 'dumbbells are loaded one hand at a time';
  if (to === 'machine' || from === 'machine') return 'machine stacks and free weights don’t compare';
  if (from === 'per_dumbbell') return 'a dumbbell load isn’t the same as one bar';
  return 'the equipment loads differently';
}

/**
 * How the replacement's load is set. A load never carries over from the
 * exercise being replaced: only the user's own last result for the exact
 * alternative is prefilled. Otherwise they choose a weight themselves.
 */
export function loadGuidance(
  current: CurrentExercise,
  option: AlternativeOption,
  unit: DisplayUnit,
): LoadGuidance {
  const { exercise, lastPerformance } = option;

  if (exercise.loadConvention === 'bodyweight') {
    return {
      mode: 'bodyweight',
      message: `${exercise.name} uses your bodyweight, so there’s no weight to set.`,
    };
  }

  if (lastPerformance?.loadMode === 'weighted' && lastPerformance.weightKg !== null) {
    return {
      mode: 'prior',
      kg: lastPerformance.weightKg,
      message: `Prefilled with ${formatLoad(lastPerformance, exercise.loadConvention, unit)}, from your last ${exercise.name} set.`,
    };
  }

  const choose = 'Choose a weight you can control for every rep.';
  if (current.targetKg !== null && current.loadConvention !== 'bodyweight') {
    const planned = formatLoad(
      { weightKg: current.targetKg, loadMode: 'weighted' },
      current.loadConvention,
      unit,
    );
    return {
      mode: 'enter',
      message: `Your ${planned} on ${current.name} doesn’t carry over, because ${whyNotCarried(current.loadConvention, exercise.loadConvention)}. ${choose}`,
    };
  }
  return { mode: 'enter', message: `You haven’t logged ${exercise.name} yet. ${choose}` };
}

/**
 * Canonical weight units. Weights are stored and sent to the API in kilograms;
 * convert only when showing a number or reading what the user typed.
 *
 * Rounding is half-up on the shortest decimal form of the number, the same
 * rule as `backend/app/core/units.py` (both run `__fixtures__/unit-conversions.json`).
 */
import type { DisplayUnit, LoadConvention, LoadMode } from './contracts';

/** Exact, by international definition. */
export const KG_PER_LB = 0.45359237;
/** Highest load any table accepts. */
export const MAX_LOAD_KG = 1000;
/** Decimal places stored in the database (`numeric(7, 3)`). */
export const STORED_KG_PLACES = 3;
/** Decimal places shown to people. */
export const DISPLAY_PLACES = 1;

/** Rounds 2.25 to 2.3 and 1.005 to 1.01, away from zero, with no binary drift. */
export function roundHalfUp(value: number, places: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Cannot round a non-finite number.');
  const sign = value < 0 ? -1 : 1;
  const [mantissa, exponent = '0'] = String(Math.abs(value)).split('e');
  const shifted = Math.round(Number(`${mantissa}e${Number(exponent) + places}`));
  const rounded = sign * Number(`${shifted}e${-places}`);
  return rounded === 0 ? 0 : rounded; // never -0
}

/** A stored kilogram value as the number shown in `unit`. */
export function kgToDisplay(kg: number, unit: DisplayUnit): number {
  return roundHalfUp(unit === 'kg' ? kg : kg / KG_PER_LB, DISPLAY_PLACES);
}

/** A number entered in `unit` as the kilogram value to store. */
export function displayToKg(value: number, unit: DisplayUnit): number {
  return roundHalfUp(unit === 'kg' ? value : value * KG_PER_LB, STORED_KG_PLACES);
}

/** `20 kg`, `44.1 lb`. Whole numbers drop the trailing `.0`. */
export function formatWeight(kg: number, unit: DisplayUnit): string {
  return `${kgToDisplay(kg, unit).toLocaleString('en-US', { maximumFractionDigits: DISPLAY_PLACES })} ${unit}`;
}

const CONVENTION_LABELS: Record<LoadConvention, string> = {
  total: 'Total load',
  per_dumbbell: 'Per dumbbell',
  machine: 'Machine setting',
  bodyweight: 'Bodyweight',
};

/** Explains what a number means for an exercise, e.g. on an input label. */
export function loadConventionLabel(convention: LoadConvention): string {
  return CONVENTION_LABELS[convention];
}

/**
 * One logged or planned load, worded so per-dumbbell and total loads are never
 * confused: `60 kg`, `20 kg each`, `45 lb (machine)`, `Bodyweight`.
 */
export function formatLoad(
  load: { weightKg: number | null; loadMode: LoadMode },
  convention: LoadConvention,
  unit: DisplayUnit,
): string {
  if (load.loadMode === 'bodyweight' || load.weightKg === null) return 'Bodyweight';
  const weight = formatWeight(load.weightKg, unit);
  if (convention === 'per_dumbbell') return `${weight} each`;
  if (convention === 'machine') return `${weight} (machine)`;
  return weight;
}

export type WeightInputResult = { ok: true; kg: number } | { ok: false; message: string };

/** Reads a weight the user typed in `unit`. Empty input is an error, not 0. */
export function parseWeightInput(text: string, unit: DisplayUnit): WeightInputResult {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { ok: false, message: 'Enter a weight.' };
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(trimmed)) {
    return { ok: false, message: 'Enter the weight as a number, like 20 or 22.5.' };
  }
  const kg = displayToKg(Number(trimmed), unit);
  if (kg > MAX_LOAD_KG) {
    return { ok: false, message: `Enter at most ${formatWeight(MAX_LOAD_KG, unit)}.` };
  }
  return { ok: true, kg };
}

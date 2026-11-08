import { describe, expect, it } from 'vitest';

import fixtures from './__fixtures__/unit-conversions.json';
import type { DisplayUnit } from './contracts';
import {
  displayToKg,
  formatLoad,
  formatWeight,
  kgToDisplay,
  loadConventionLabel,
  parseWeightInput,
  roundHalfUp,
} from './units';

describe('shared conversion fixtures (also run by the Python tests)', () => {
  it.each(fixtures.roundHalfUp)('rounds $value to $places places', ({ value, places, expected }) => {
    expect(roundHalfUp(value, places)).toBe(expected);
  });

  it.each(fixtures.kgToDisplay)('shows $kg kg in $unit', ({ kg, unit, expected }) => {
    expect(kgToDisplay(kg, unit as DisplayUnit)).toBe(expected);
  });

  it.each(fixtures.displayToKg)('stores $value $unit', ({ value, unit, expected }) => {
    expect(displayToKg(value, unit as DisplayUnit)).toBe(expected);
  });
});

describe('roundHalfUp', () => {
  it('rounds negatives away from zero and never returns -0', () => {
    expect(roundHalfUp(-2.25, 1)).toBe(-2.3);
    expect(Object.is(roundHalfUp(-0.01, 1), 0)).toBe(true);
  });

  it('rejects non-finite input', () => {
    expect(() => roundHalfUp(Number.NaN, 1)).toThrow(RangeError);
  });
});

describe('round trips', () => {
  it('shows every whole pound the user typed back unchanged', () => {
    for (let lb = 0; lb <= 2200; lb += 1) {
      expect(kgToDisplay(displayToKg(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('shows every half-pound and tenth-kilogram entry back unchanged', () => {
    for (let tenths = 0; tenths <= 10000; tenths += 5) {
      expect(kgToDisplay(displayToKg(tenths / 10, 'lb'), 'lb')).toBe(tenths / 10);
    }
    for (let tenths = 0; tenths <= 10000; tenths += 1) {
      expect(kgToDisplay(displayToKg(tenths / 10, 'kg'), 'kg')).toBe(tenths / 10);
    }
  });
});

describe('formatting', () => {
  it('formats weights without trailing zeros', () => {
    expect(formatWeight(20, 'kg')).toBe('20 kg');
    expect(formatWeight(22.5, 'kg')).toBe('22.5 kg');
    expect(formatWeight(20, 'lb')).toBe('44.1 lb');
    expect(formatWeight(1000, 'lb')).toBe('2,204.6 lb');
  });

  it('never lets a per-dumbbell load read like a total', () => {
    const load = { weightKg: 20, loadMode: 'weighted' as const };
    expect(formatLoad(load, 'per_dumbbell', 'kg')).toBe('20 kg each');
    expect(formatLoad(load, 'total', 'kg')).toBe('20 kg');
    expect(formatLoad(load, 'machine', 'lb')).toBe('44.1 lb (machine)');
    expect(formatLoad({ weightKg: null, loadMode: 'bodyweight' }, 'bodyweight', 'kg')).toBe(
      'Bodyweight',
    );
  });

  it('labels each load convention', () => {
    expect(loadConventionLabel('per_dumbbell')).toBe('Per dumbbell');
    expect(loadConventionLabel('total')).toBe('Total load');
  });
});

describe('parseWeightInput', () => {
  it('converts what the user typed into kilograms', () => {
    expect(parseWeightInput(' 45 ', 'lb')).toEqual({ ok: true, kg: 20.412 });
    expect(parseWeightInput('22,5', 'kg')).toEqual({ ok: true, kg: 22.5 });
    expect(parseWeightInput('.5', 'kg')).toEqual({ ok: true, kg: 0.5 });
    expect(parseWeightInput('0', 'kg')).toEqual({ ok: true, kg: 0 });
  });

  it.each(['', '   ', '-5', 'abc', '1e3', 'Infinity', '20kg', '1.2.3'])(
    'rejects %j',
    (text) => {
      expect(parseWeightInput(text, 'kg').ok).toBe(false);
    },
  );

  it('rejects loads over the limit in the unit the user is using', () => {
    expect(parseWeightInput('1000', 'kg')).toEqual({ ok: true, kg: 1000 });
    expect(parseWeightInput('1000.1', 'kg')).toEqual({
      ok: false,
      message: 'Enter at most 1,000 kg.',
    });
    expect(parseWeightInput('2205', 'lb')).toEqual({
      ok: false,
      message: 'Enter at most 2,204.6 lb.',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  extendRest, pauseRest, remainingSeconds, resumeRest, skipRest, startRest,
  validateLogSetInput, validateRestState, validateStartWorkoutInput, validateTargets,
} from './index';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-11-07T12:00:00Z');
const set = { sessionExerciseId: ID, operationId: ID, reps: 10, weightKg: 20, loadMode: 'weighted' };

describe('workout input validation', () => {
  it.each([true, '10', 1.5, 0, 101])('rejects invalid reps %s', (reps) => {
    expect(validateLogSetInput({ ...set, reps }).error?.field).toBe('reps');
  });
  it.each([true, '20', -1, NaN, Infinity, 1001, null])('rejects invalid load %s', (weightKg) => {
    expect(validateLogSetInput({ ...set, weightKg }).error).not.toBeNull();
  });
  it('distinguishes explicit zero load from bodyweight', () => {
    expect(validateLogSetInput({ ...set, weightKg: 0 }).error).toBeNull();
    expect(validateLogSetInput({ ...set, weightKg: null, loadMode: 'bodyweight' }).error).toBeNull();
    expect(validateLogSetInput({ ...set, weightKg: 0, loadMode: 'bodyweight' }).error).not.toBeNull();
  });
  it('requires valid operation IDs and rejects owner injection', () => {
    expect(validateStartWorkoutInput({ routineId: ID }).error).not.toBeNull();
    expect(validateStartWorkoutInput({ routineId: ID, operationId: 'bad' }).error).not.toBeNull();
    expect(validateStartWorkoutInput({ routineId: ID, operationId: ID, ownerId: ID }).error).not.toBeNull();
    expect(validateStartWorkoutInput({ routineId: ID, operationId: ID }).error).toBeNull();
  });
  it('validates target bounds', () => {
    const targets = { targetSets: 3, targetReps: 10, targetKg: null, restSeconds: 90 };
    expect(validateTargets(targets).error).toBeNull();
    expect(validateTargets({ ...targets, targetSets: 21 }).error).not.toBeNull();
    expect(validateTargets({ ...targets, restSeconds: 601 }).error).not.toBeNull();
  });
});

describe('timestamp-based rest timer', () => {
  for (const duration of [0, 1, 30, 90, 599, 600]) {
    it.each([0, 0.001, 1, 29.9, 90, 600, 3600])(`recovers ${duration}s rest after %ss`, (elapsed) => {
      const restored = validateRestState(JSON.parse(JSON.stringify(startRest(duration, NOW))));
      expect(restored.error).toBeNull();
      const later = NOW + elapsed * 1000;
      const expected = Math.max(0, Math.ceil(duration - elapsed));
      expect(remainingSeconds(restored.data!, later)).toBe(expected);
      expect(remainingSeconds(pauseRest(restored.data!, later), later + 86400000)).toBe(expected);
    });
  }
  it('recovers from serialized state without restarting', () => {
    const restored = validateRestState(JSON.parse(JSON.stringify(startRest(90, NOW))));
    expect(restored.error).toBeNull();
    expect(remainingSeconds(restored.data!, NOW + 30100)).toBe(60);
    expect(remainingSeconds(restored.data!, NOW + 100000)).toBe(0);
  });
  it('pauses, resumes, and does not restart running timers', () => {
    const running = startRest(90, NOW);
    const paused = pauseRest(running, NOW + 30100);
    expect(remainingSeconds(paused, NOW + 3600000)).toBe(60);
    expect(remainingSeconds(resumeRest(paused, NOW + 3600000), NOW + 3615000)).toBe(45);
    expect(resumeRest(running, NOW + 10000)).toEqual(running);
  });
  it('extends running and paused timers with a 600-second cap', () => {
    expect(remainingSeconds(extendRest(startRest(90, NOW), NOW), NOW)).toBe(120);
    expect(remainingSeconds(extendRest(pauseRest(startRest(90, NOW), NOW), NOW), NOW)).toBe(120);
    expect(remainingSeconds(extendRest(startRest(590, NOW), NOW), NOW)).toBe(600);
    expect(extendRest(startRest(10, NOW), NOW + 20000)).toEqual(skipRest());
    expect(startRest(0, NOW)).toEqual(skipRest());
  });
  it.each([-1, 1.5, 601, NaN, Infinity])('rejects invalid duration %s', (seconds) => {
    expect(() => startRest(seconds, NOW)).toThrow();
  });
  it('rejects malformed persisted states and timestamps', () => {
    expect(validateRestState({ status: 'running' }).error).not.toBeNull();
    expect(validateRestState({ status: 'idle', remainingSeconds: 10 }).error).not.toBeNull();
    expect(validateRestState({ status: 'running', endsAt: '2026-02-30T12:00:00Z' }).error).not.toBeNull();
    expect(() => startRest(90, NaN)).toThrow();
  });
});
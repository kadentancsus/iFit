import type { RestState } from './types';
import { validateRestState } from './validators';

function checkNow(now: number): void {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) {
    throw new RangeError('now must be a valid epoch timestamp in milliseconds.');
  }
}

export function remainingSeconds(state: RestState, now: number): number {
  checkNow(now);
  if (validateRestState(state).error) throw new RangeError('Invalid rest state.');
  return state.status === 'running'
    ? Math.max(0, Math.min(600, Math.ceil((Date.parse(state.endsAt) - now) / 1000)))
    : state.remainingSeconds;
}

export function skipRest(): RestState {
  return { status: 'idle', endsAt: null, remainingSeconds: 0 };
}

export function startRest(seconds: number, now: number): RestState {
  checkNow(now);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 600) {
    throw new RangeError('Rest must be a whole number from 0 to 600 seconds.');
  }
  return seconds === 0 ? skipRest() : {
    status: 'running', endsAt: new Date(now + seconds * 1000).toISOString(), remainingSeconds: 0,
  };
}

export function pauseRest(state: RestState, now: number): RestState {
  const seconds = remainingSeconds(state, now);
  return seconds ? { status: 'paused', endsAt: null, remainingSeconds: seconds } : skipRest();
}

export function resumeRest(state: RestState, now: number): RestState {
  remainingSeconds(state, now); // Validate without restarting an already running timer.
  return state.status === 'paused' ? startRest(state.remainingSeconds, now) : state;
}

export function extendRest(state: RestState, now: number): RestState {
  const seconds = remainingSeconds(state, now);
  if (!seconds) return skipRest();
  const extended = Math.min(600, seconds + 30);
  return state.status === 'paused'
    ? { status: 'paused', endsAt: null, remainingSeconds: extended }
    : startRest(extended, now);
}
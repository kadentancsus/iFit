import { describe, expect, it } from 'vitest';

import type { ApiResult, StartWorkoutInput, WorkoutDetail } from '@/lib/contracts';

import { StartOperations, isUncertainFailure, startPlannedWorkout, workoutPath } from './start-workout';

const PLAN = { id: 'plan-1', routineId: 'routine-1', routineTitle: 'Legs' };

/**
 * Behaves like the workout_start database function: a repeated operation ID
 * returns its first result, and a running workout is returned instead of
 * starting a second one.
 */
class FakeWorkoutServer {
  sessions: { id: string; routineId: string; scheduleId: string | null }[] = [];
  private byOperation = new Map<string, string>();
  requests: StartWorkoutInput[] = [];
  /** Responses to send instead of handling, in order (e.g. a dropped connection). */
  scripted: ApiResult<WorkoutDetail>[] = [];
  /** When true, the next request is applied but its response is lost. */
  loseNextResponse = false;

  start = async (input: StartWorkoutInput): Promise<ApiResult<WorkoutDetail>> => {
    this.requests.push(input);
    await Promise.resolve(); // let concurrent taps interleave
    const scripted = this.scripted.shift();
    if (scripted) return scripted;

    let id = this.byOperation.get(input.operationId);
    if (!id) {
      const active = this.sessions[0];
      id = active?.id ?? `session-${this.sessions.length + 1}`;
      if (!active) {
        this.sessions.push({ id, routineId: input.routineId, scheduleId: input.scheduleId ?? null });
      }
      this.byOperation.set(input.operationId, id);
    }
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      return { data: null, error: { code: 'network_error', message: "Couldn't reach iFit." } };
    }
    return { data: { session: { id } } as WorkoutDetail, error: null };
  };
}

const counter = () => {
  let n = 0;
  return () => `op-${++n}`;
};

describe('startPlannedWorkout', () => {
  it('starts the planned routine and goes to its workout page', async () => {
    const server = new FakeWorkoutServer();
    const outcome = await startPlannedWorkout(PLAN, server.start, new StartOperations(counter()));
    expect(outcome).toEqual({ type: 'started', sessionId: 'session-1' });
    expect(server.requests).toEqual([
      { routineId: 'routine-1', scheduleId: 'plan-1', operationId: 'op-1' },
    ]);
    expect(workoutPath('session-1')).toBe('/workout/session-1');
  });

  it('turns a double tap into one workout', async () => {
    const server = new FakeWorkoutServer();
    const operations = new StartOperations(counter());
    const [first, second] = await Promise.all([
      startPlannedWorkout(PLAN, server.start, operations),
      startPlannedWorkout(PLAN, server.start, operations),
    ]);
    expect(server.requests.map((r) => r.operationId)).toEqual(['op-1', 'op-1']);
    expect(server.sessions).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it('retries a lost response with the same ID, so the first start is reused', async () => {
    const server = new FakeWorkoutServer();
    const operations = new StartOperations(counter());
    server.loseNextResponse = true;

    const failed = await startPlannedWorkout(PLAN, server.start, operations);
    expect(failed).toMatchObject({ type: 'failed', retrySafe: true });
    expect(failed.type === 'failed' && failed.message).toMatch(/Tapping Start again is safe/);

    const retried = await startPlannedWorkout(PLAN, server.start, operations);
    expect(retried).toEqual({ type: 'started', sessionId: 'session-1' });
    expect(server.requests.map((r) => r.operationId)).toEqual(['op-1', 'op-1']);
    expect(server.sessions).toHaveLength(1);
  });

  it('uses a fresh ID after a definite failure', async () => {
    const server = new FakeWorkoutServer();
    const operations = new StartOperations(counter());
    server.scripted.push({
      data: null,
      error: { code: 'conflict', message: 'The workout changed. Refresh and review before retrying.' },
    });

    const failed = await startPlannedWorkout(PLAN, server.start, operations);
    expect(failed).toEqual({
      type: 'failed',
      retrySafe: false,
      message: 'The workout changed. Refresh and review before retrying.',
    });
    await startPlannedWorkout(PLAN, server.start, operations);
    expect(server.requests.map((r) => r.operationId)).toEqual(['op-1', 'op-2']);
  });

  it('uses a fresh ID for the next plan after a success', async () => {
    const operations = new StartOperations(counter());
    const server = new FakeWorkoutServer();
    await startPlannedWorkout(PLAN, server.start, operations);
    expect(operations.idFor(PLAN.id)).toBe('op-2');
    expect(operations.idFor('another-plan')).toBe('op-3');
  });

  it('opens the workout already running instead of starting a second', async () => {
    const server = new FakeWorkoutServer();
    server.sessions.push({ id: 'running', routineId: 'other', scheduleId: null });
    const outcome = await startPlannedWorkout(PLAN, server.start, new StartOperations(counter()));
    expect(outcome).toEqual({ type: 'started', sessionId: 'running' });
    expect(server.sessions).toHaveLength(1);
  });
});

describe('isUncertainFailure', () => {
  it('treats network and server trouble as "maybe started"', () => {
    for (const code of ['network_error', 'bad_response', 'request_failed', 'database_unavailable']) {
      expect(isUncertainFailure(code)).toBe(true);
    }
  });

  it('treats a clear refusal as "did not start"', () => {
    for (const code of ['conflict', 'not_found', 'invalid_input', 'not_authenticated']) {
      expect(isUncertainFailure(code)).toBe(false);
    }
  });
});

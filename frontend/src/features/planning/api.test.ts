import { describe, expect, it, vi } from 'vitest';

import { catalogApi } from '../catalog/api';
import { planningApi } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ok = (data: unknown = {}) => vi.fn<typeof fetch>(async () => json(200, { data, error: null }));

const calls = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetcher.mock.calls.map(([url, init]) => [
    init?.method,
    String(url).replace(/^https?:\/\/[^/]+/, ''),
    init?.body ?? null,
  ]);

const signedIn = (fetcher: typeof fetch) => planningApi(async () => 'user-token', fetcher);

describe('planning API client', () => {
  it('sends the access token', async () => {
    const fetcher = ok([]);

    expect(await signedIn(fetcher).listRoutines()).toEqual({ data: [], error: null });
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer user-token' });
  });

  it('creates without an ID and updates with one', async () => {
    const fetcher = ok();
    const api = signedIn(fetcher);

    await api.saveRoutine({ title: 'Push', exercises: [], operationId: 'op' });
    await api.saveRoutine({ id: 'abc', title: 'Push', exercises: [] });

    expect(calls(fetcher)).toEqual([
      ['POST', '/api/v1/routines', '{"title":"Push","exercises":[],"operationId":"op"}'],
      ['PUT', '/api/v1/routines/abc', '{"id":"abc","title":"Push","exercises":[]}'],
    ]);
  });

  it('escapes IDs placed in the path', async () => {
    const fetcher = ok();

    await signedIn(fetcher).getRoutine('../profile');

    expect(calls(fetcher)[0]![1]).toBe('/api/v1/routines/..%2Fprofile');
  });

  it('lists, reschedules and cancels plans', async () => {
    const fetcher = ok();
    const api = signedIn(fetcher);

    await api.listScheduledWorkouts({ fromDate: '2026-11-01' });
    await api.rescheduleWorkout('abc', '2026-11-20');
    await api.cancelScheduledWorkout('abc');

    expect(calls(fetcher)).toEqual([
      ['GET', '/api/v1/schedule?fromDate=2026-11-01', null],
      ['PATCH', '/api/v1/schedule/abc', '{"localDate":"2026-11-20"}'],
      ['POST', '/api/v1/schedule/abc/cancel', null],
    ]);
  });

  it('passes server errors through with their field', async () => {
    const error = { code: 'invalid_title', message: 'Give it a name.', field: 'title' };
    const fetcher = vi.fn<typeof fetch>(async () => json(422, { data: null, error }));

    expect(await signedIn(fetcher).listRoutines()).toEqual({ data: null, error });
  });

  it('asks the user to sign in without calling the API', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const result = await planningApi(async () => null, fetcher).listRoutines();

    expect(result.error?.code).toBe('not_authenticated');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('turns a network failure into a safe error', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await signedIn(fetcher).listRoutines();

    expect(result.error?.code).toBe('network_error');
    expect(result.error?.message).not.toContain('Failed to fetch');
  });
});

describe('catalog API client', () => {
  it('never sends a token and skips empty filters', async () => {
    const fetcher = ok([]);

    await catalogApi(fetcher).listExercises({ search: 'squat', equipment: undefined, pattern: 'squat' });

    expect(calls(fetcher)).toEqual([['GET', '/api/v1/exercises?search=squat&pattern=squat', null]]);
    expect(fetcher.mock.calls[0]![1]?.headers).not.toHaveProperty('Authorization');
  });
});

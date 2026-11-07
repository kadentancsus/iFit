import { describe, expect, it, vi } from 'vitest';

import { createRoutinesApi } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const apiWith = (fetcher: typeof fetch, token: string | null = 'user-token') =>
  createRoutinesApi({
    baseUrl: 'http://api.test',
    getToken: async () => token,
    fetcher,
  });

describe('routines API client', () => {
  it('sends the access token and returns the data', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(200, { data: [], error: null }));

    const result = await apiWith(fetcher).listRoutines();

    expect(result).toEqual({ data: [], error: null });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/v1/routines');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer user-token' });
  });

  it('creates when the input has no ID', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(201, { data: {}, error: null }));

    await apiWith(fetcher).saveRoutine({ title: 'Push', exercises: [], operationId: 'op' });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/v1/routines');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      title: 'Push',
      exercises: [],
      operationId: 'op',
    });
  });

  it('updates when the input has an ID', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(200, { data: {}, error: null }));

    await apiWith(fetcher).saveRoutine({ id: 'abc', title: 'Push', exercises: [] });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/v1/routines/abc');
    expect(init?.method).toBe('PUT');
  });

  it('escapes IDs placed in the path', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json(200, { data: {}, error: null }));

    await apiWith(fetcher).getRoutine('../profile');

    expect(fetcher.mock.calls[0]![0]).toBe('http://api.test/api/v1/routines/..%2Fprofile');
  });

  it('passes server errors through with their field', async () => {
    const error = { code: 'invalid_title', message: 'Give it a name.', field: 'title' };
    const fetcher = vi.fn<typeof fetch>(async () => json(422, { data: null, error }));

    expect(await apiWith(fetcher).listRoutines()).toEqual({ data: null, error });
  });

  it('asks the user to sign in without calling the API', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const result = await apiWith(fetcher, null).listRoutines();

    expect(result.error?.code).toBe('not_authenticated');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('turns a network failure into a safe error', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await apiWith(fetcher).listRoutines();

    expect(result.error?.code).toBe('network_error');
    expect(result.error?.message).not.toContain('Failed to fetch');
  });

  it('handles a response that is not JSON', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 502 }));

    expect((await apiWith(fetcher).listRoutines()).error?.code).toBe('request_failed');
  });
});

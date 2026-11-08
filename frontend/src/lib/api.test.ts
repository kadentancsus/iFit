import { describe, expect, it, vi } from 'vitest';

import { buildPath, buildUrl, callApi } from './api';

const BASE = 'http://api.test';

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

describe('URLs', () => {
  it('fills and encodes path parameters', () => {
    expect(buildPath('/routines/{routineId}', { routineId: 'a/b c' })).toBe('/routines/a%2Fb%20c');
    expect(() => buildPath('/routines/{routineId}')).toThrow(/routineId/);
  });

  it('builds versioned URLs with query strings, skipping empty values', () => {
    expect(
      buildUrl('getAlternatives', {
        baseUrl: BASE,
        params: { exerciseId: 'e1' },
        query: { kind: 'substitution', equipment: ['dumbbell', 'cable'], muscle: undefined, q: '' },
      }),
    ).toBe(`${BASE}/api/v1/exercises/e1/alternatives?kind=substitution&equipment=dumbbell&equipment=cable`);
  });
});

describe('callApi', () => {
  it('sends the token and JSON body with the contract method', async () => {
    const fetch = respond(200, { data: { id: 'r1' }, error: null });
    const result = await callApi<{ id: string }>('updateRoutine', {
      baseUrl: BASE,
      fetch,
      accessToken: 'tok',
      params: { routineId: 'r1' },
      body: { title: 'Push day' },
    });

    expect(result).toEqual({ data: { id: 'r1' }, error: null });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/routines/r1`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"title":"Push day"}');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    });
  });

  it('omits the Authorization header when signed out', async () => {
    const fetch = respond(200, { data: { status: 'ok' }, error: null });
    await callApi('getSession', { baseUrl: BASE, fetch });
    expect(fetch.mock.calls[0]![1]?.headers).not.toHaveProperty('Authorization');
  });

  it('passes API errors through unchanged', async () => {
    const error = { code: 'invalid_session', message: 'Please sign in again.', field: null };
    const result = await callApi('getDashboard', {
      baseUrl: BASE,
      fetch: respond(401, { data: null, error }),
    });
    expect(result).toEqual({ data: null, error });
  });

  it('turns a network failure into a retryable error instead of throwing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await callApi('logSet', { baseUrl: BASE, fetch, body: {} });
    expect(result.error?.code).toBe('network_error');
  });

  it('rethrows when the caller aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(
      callApi('getDashboard', { baseUrl: BASE, fetch, signal: controller.signal }),
    ).rejects.toThrow('Aborted');
  });

  it.each([
    ['non-JSON', 502, '<html>Bad gateway</html>'],
    ['the wrong shape', 200, { ok: true }],
    ['a success status with an error', 200, { data: null, error: { code: 'x', message: 'y' } }],
    ['a failure status without an error', 500, { data: {}, error: null }],
  ])('never reports success for %s', async (_, status, body) => {
    const result = await callApi('getDashboard', { baseUrl: BASE, fetch: respond(status, body) });
    expect(result.error?.code).toBe('bad_response');
  });
});

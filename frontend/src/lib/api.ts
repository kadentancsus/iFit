/**
 * Typed calls to the FastAPI backend. Every call resolves to `{ data, error }`
 * and never throws for HTTP or network failures (only for programmer errors
 * such as a missing path parameter, or when the caller aborts).
 */
import { API_ROUTES, type ApiErrorBody, type ApiResult, type OperationName } from './contracts';

export const API_PREFIX = '/api/v1';

const DEFAULT_BASE_URL = 'http://localhost:8000';

type QueryValue = string | number | boolean | null | undefined | readonly string[];

export interface CallApiOptions {
  /** Supabase access token for the signed-in user. */
  accessToken?: string | null;
  /** Values for `{name}` placeholders in the path. */
  params?: Record<string, string>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Defaults to NEXT_PUBLIC_API_BASE_URL. */
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Fills `{name}` placeholders; throws if one is missing. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (!value) throw new Error(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

export function buildUrl(
  operation: OperationName,
  options: Pick<CallApiOptions, 'params' | 'query' | 'baseUrl'> = {},
): string {
  const url = new URL(
    `${options.baseUrl ?? apiBaseUrl()}${API_PREFIX}${buildPath(API_ROUTES[operation].path, options.params)}`,
  );
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(item));
    }
  }
  return url.toString();
}

const NETWORK_ERROR: ApiErrorBody = {
  code: 'network_error',
  message: "Couldn't reach iFit. Check your connection and try again.",
};

const BAD_RESPONSE: ApiErrorBody = {
  code: 'bad_response',
  message: 'iFit sent an unexpected response. Please try again.',
};

function isResult(value: unknown): value is ApiResult<unknown> {
  if (typeof value !== 'object' || value === null || !('data' in value) || !('error' in value)) {
    return false;
  }
  const { error } = value as { error: unknown };
  return (
    error === null ||
    (typeof error === 'object' &&
      typeof (error as ApiErrorBody).code === 'string' &&
      typeof (error as ApiErrorBody).message === 'string')
  );
}

export async function callApi<T>(
  operation: OperationName,
  options: CallApiOptions = {},
): Promise<ApiResult<T>> {
  const { method } = API_ROUTES[operation];
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(buildUrl(operation, options), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { data: null, error: NETWORK_ERROR };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { data: null, error: BAD_RESPONSE };
  }
  if (!isResult(payload)) return { data: null, error: BAD_RESPONSE };
  if (response.ok !== (payload.error === null)) return { data: null, error: BAD_RESPONSE };
  return payload as ApiResult<T>;
}

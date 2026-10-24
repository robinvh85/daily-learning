import { API_PREFIX } from '@daily-learning/shared';
import type { ApiError } from '@daily-learning/shared/api';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Fetch `/api<path>` as JSON. Throws `ApiRequestError` for non-2xx responses. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    signal: init.signal,
  });
  if (!res.ok) {
    let body: Partial<ApiError> = {};
    try {
      body = (await res.json()) as ApiError;
    } catch {
      // Not JSON (e.g. proxy error).
    }
    throw new ApiRequestError(
      res.status,
      body.error ?? 'http_error',
      body.message ?? `HTTP ${res.status}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

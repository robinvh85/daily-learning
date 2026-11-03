/**
 * `api('/lessons')`: the pages' single entry point to data.
 *
 * There is no server: the default transport answers the `/api/*` paths in the browser
 * (`backend/`, Firestore + static content files), loaded lazily so the first paint does not wait
 * for the Firebase SDK. Tests swap in `fetchTransport` and stub `fetch` with canned responses.
 */
import { API_PREFIX } from '@daily-learning/shared';
import type { ApiError } from '@daily-learning/shared/api';
import { ApiRequestError } from './errors';

export { ApiRequestError };

export interface ApiInit {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/** Answers `path` (without the `/api` prefix, with its query string). */
export type ApiTransport = (path: string, init: ApiInit) => Promise<unknown>;

const browserTransport: ApiTransport = async (path, init) => {
  const { handleApi } = await import('../backend');
  return handleApi(path, init);
};

/** Real HTTP: `fetch('/api' + path)`. Used by the component tests. */
export const fetchTransport: ApiTransport = async (path, init) => {
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
      // Not JSON.
    }
    throw new ApiRequestError(
      res.status,
      body.error ?? 'http_error',
      body.message ?? `HTTP ${res.status}`,
    );
  }
  if (res.status === 204) return undefined;
  return res.json();
};

let transport: ApiTransport = browserTransport;

export function setApiTransport(t: ApiTransport): void {
  transport = t;
}

/** Call `/api<path>`. Throws `ApiRequestError` on failure. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  return (await transport(path, init)) as T;
}

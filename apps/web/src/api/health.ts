import { API_PREFIX, type HealthResponse } from '@daily-learning/shared';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_PREFIX}/health`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as HealthResponse;
}

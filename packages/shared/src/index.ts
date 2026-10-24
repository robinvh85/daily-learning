export * from './constants.js';
export * from './srs.js';

/** Prefix for every REST endpoint (plan section 5). */
export const API_PREFIX = '/api';

export type HealthStatus = 'ok';

/** Response body of `GET /api/health`. */
export interface HealthResponse {
  status: HealthStatus;
  /** Server uptime in seconds. */
  uptime: number;
  /** ISO 8601 timestamp of the response. */
  time: string;
}

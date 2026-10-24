import type { HealthResponse } from '@daily-learning/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

describe('GET /api/health', () => {
  const app = buildApp();
  afterAll(() => app.close());

  it('returns status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('readConfig', () => {
  it('defaults to 127.0.0.1:3000', () => {
    expect(readConfig({})).toMatchObject({ host: '127.0.0.1', port: 3000 });
  });

  it('rejects an invalid port', () => {
    expect(() => readConfig({ PORT: 'abc' })).toThrow(/Invalid PORT/);
  });
});

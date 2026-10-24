import type { HealthResponse } from '@daily-learning/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSafeBinding, readConfig } from '../src/config.js';
import { createTestApp, type TestApp } from './helpers/app.js';

describe('GET /api/health', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('returns status ok', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('readConfig', () => {
  it('defaults to 127.0.0.1:3000 without login', () => {
    expect(readConfig({})).toMatchObject({ host: '127.0.0.1', port: 3000, authMode: 'none' });
  });

  it('rejects an invalid port', () => {
    expect(() => readConfig({ PORT: 'abc' })).toThrow(/Invalid PORT/);
  });

  it('rejects an unknown AUTH_MODE', () => {
    expect(() => readConfig({ AUTH_MODE: 'open' })).toThrow(/Invalid AUTH_MODE/);
  });
});

describe('startup guard (plan 2.6)', () => {
  it.each(['127.0.0.1', 'localhost', '::1', 'LOCALHOST'])(
    'allows HOST=%s with AUTH_MODE=none',
    (host) => {
      expect(() => readConfig({ HOST: host, AUTH_MODE: 'none' })).not.toThrow();
    },
  );

  it.each(['0.0.0.0', '192.168.1.10', '::', 'example.com'])(
    'refuses HOST=%s with AUTH_MODE=none',
    (host) => {
      expect(() => readConfig({ HOST: host, AUTH_MODE: 'none' })).toThrow(/Refusing to start/);
      expect(() => assertSafeBinding({ host, authMode: 'none' })).toThrow(/AUTH_MODE=none/);
    },
  );

  it('refuses a public HOST when AUTH_MODE is not set (defaults to none)', () => {
    expect(() => readConfig({ HOST: '0.0.0.0' })).toThrow(/Refusing to start/);
  });

  it('allows a public HOST with AUTH_MODE=password', () => {
    expect(readConfig({ HOST: '0.0.0.0', AUTH_MODE: 'password' })).toMatchObject({
      host: '0.0.0.0',
      authMode: 'password',
    });
  });
});

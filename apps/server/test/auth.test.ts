import type { MeResponse } from '@daily-learning/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, users } from '../src/db/schema.js';
import { SESSION_COOKIE } from '../src/modules/auth/routes.js';
import { createUser, ensureDefaultUser } from '../src/modules/auth/users.js';
import { createTestApp, type TestApp } from './helpers/app.js';

describe('AUTH_MODE=none', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp('none');
  });
  afterAll(() => t.close());

  it('creates one default user and attaches every request to it', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(200);
    const me = res.json<MeResponse>();
    expect(me.authMode).toBe('none');
    expect(me.user).toMatchObject({ email: null });
    expect(ensureDefaultUser(t.db).id).toBe(me.user!.id);
    expect(t.db.select().from(users).all()).toHaveLength(1);
  });

  it('serves the API without a session', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/lessons' });
    expect(res.statusCode).toBe(200);
  });

  it('has no login or logout routes', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@b.co', password: 'x' },
    });
    expect(login.statusCode).toBe(404);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(404);
  });
});

describe('AUTH_MODE=password', () => {
  let t: TestApp;
  const email = 'learner@example.com';
  const password = 'correct horse battery';

  beforeAll(async () => {
    t = await createTestApp('password');
    await createUser(t.db, email, password);
  });
  afterAll(() => t.close());

  const login = (body: object, host = 'localhost:3000') =>
    t.app.inject({ method: 'POST', url: '/api/auth/login', payload: body, headers: { host } });

  it('stores an argon2id hash, never the password', () => {
    const row = t.db
      .select()
      .from(users)
      .all()
      .find((u) => u.email === email)!;
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(password);
  });

  it('rejects duplicate emails and short passwords', async () => {
    await expect(createUser(t.db, 'LEARNER@example.com', 'another password')).rejects.toThrow(
      /already exists/,
    );
    await expect(createUser(t.db, 'x@example.com', 'short')).rejects.toThrow(/at least/);
  });

  it('reports no user and blocks the API without a session', async () => {
    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.json<MeResponse>()).toEqual({ authMode: 'password', user: null });
    const lessons = await t.app.inject({ method: 'GET', url: '/api/lessons' });
    expect(lessons.statusCode).toBe(401);
    expect(lessons.json()).toMatchObject({ error: 'unauthorized' });
    const health = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  it('rejects a wrong password or unknown email', async () => {
    expect((await login({ email, password: 'wrong password' })).statusCode).toBe(401);
    expect((await login({ email: 'nobody@example.com', password })).statusCode).toBe(401);
    expect((await login({ email: 'not-an-email', password })).statusCode).toBe(400);
  });

  it('logs in with a httpOnly SameSite=Lax cookie, then logs out', async () => {
    const res = await login({ email: 'Learner@Example.com', password });
    expect(res.statusCode).toBe(200);
    expect(res.json<MeResponse>().user).toMatchObject({ email });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i); // plain http on localhost

    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    const cookies = { [SESSION_COOKIE]: cookie.value };
    // Only the hash of the token is stored.
    expect(
      t.db
        .select()
        .from(sessions)
        .all()
        .map((s) => s.id),
    ).not.toContain(cookie.value);

    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', cookies });
    expect(me.json<MeResponse>().user).toMatchObject({ email });
    expect((await t.app.inject({ method: 'GET', url: '/api/lessons', cookies })).statusCode).toBe(
      200,
    );

    const out = await t.app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
    expect(out.statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: '/api/lessons', cookies })).statusCode).toBe(
      401,
    );
  });

  it('sets a Secure cookie when the request is not for localhost', async () => {
    const res = await login({ email, password }, 'learn.example.com');
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
  });
});

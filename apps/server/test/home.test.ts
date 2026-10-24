import type {
  DashboardResponse,
  HeartbeatResponse,
  LessonDetailResponse,
  TodayResponse,
} from '@daily-learning/shared/api';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailyActivity, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './helpers/app.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
// Saturday 24/10/2026, 09:00 in Vietnam.
let clock = new Date('2026-10-24T02:00:00Z');
const setClock = (iso: string) => {
  clock = new Date(iso);
};

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp('none', { now: () => clock, displayName: 'Viet' });
});
afterAll(() => t.close());

const get = async <T>(url: string) => (await t.app.inject({ method: 'GET', url })).json<T>();
const beat = (payload: unknown) =>
  t.app.inject({ method: 'POST', url: '/api/activity/heartbeat', payload: payload as object });
const progress = (slug: string, payload: object) =>
  t.app.inject({ method: 'POST', url: `/api/lessons/${slug}/progress`, payload });
const activity = () => t.db.select().from(dailyActivity).all();

describe('GET /api/today', () => {
  it('starts on day 1 with 3 steps and continues with reading', async () => {
    const today = await get<TodayResponse>('/api/today');
    expect(today).toMatchObject({
      date: '2026-10-24',
      source: 'plan',
      day: 1,
      title: 'Cuộc sống quanh khu phố',
      continueUrl: '/read/a-new-coffee-shop',
      allDone: false,
    });
    expect(today.steps.map((s) => [s.kind, s.status, s.progressPct])).toEqual([
      ['reading', 'not_started', 0],
      ['listening', 'not_started', 0],
      ['reviews', 'done', 100],
    ]);
    expect(today.estimatedMinutes).toBe(today.steps[0]!.minutes + today.steps[1]!.minutes);
  });

  it('follows lesson progress and stays on day 1 for the rest of the day', async () => {
    await progress('a-new-coffee-shop', { step: 1 });
    let today = await get<TodayResponse>('/api/today');
    expect(today.steps[0]).toMatchObject({ status: 'in_progress', progressPct: 33 });

    await progress('a-new-coffee-shop', { step: 2, status: 'completed', score: 1 });
    today = await get<TodayResponse>('/api/today');
    expect(today.steps[0]).toMatchObject({ status: 'done', progressPct: 100 });
    expect(today.continueUrl).toBe('/listen/at-the-train-station');

    setClock('2026-10-24T05:00:00Z');
    await progress('at-the-train-station', { step: 2, status: 'completed', score: 0.5 });
    today = await get<TodayResponse>('/api/today');
    expect(today).toMatchObject({ day: 1, allDone: true, continueUrl: null, estimatedMinutes: 0 });
  });

  it('moves on to day 2 the next day', async () => {
    // The "Đã học hết bài hiện có" fallback is covered in daily-plan.test.ts.
    setClock('2026-10-24T17:05:00Z'); // 00:05 on the 25th in Vietnam
    const today = await get<TodayResponse>('/api/today');
    expect(today).toMatchObject({
      date: '2026-10-25',
      source: 'plan',
      day: 2,
      title: 'Công việc mới',
      continueUrl: '/read/my-first-week-at-a-new-job',
      allDone: false,
    });
    expect(today.steps[0]).toMatchObject({ kind: 'reading', status: 'not_started' });
    expect(today.steps.at(-1)?.kind).toBe('reviews');
  });
});

describe('lessons_done', () => {
  it('counts a completed lesson once per lesson', async () => {
    const before = activity().find((a) => a.date === '2026-10-24');
    expect(before?.lessonsDone).toBe(2);
    // Completing again (and on another day) does not count twice.
    await progress('a-new-coffee-shop', { step: 2, status: 'completed', score: 1 });
    await progress('at-the-train-station', { step: 2, status: 'completed' });
    expect(activity().reduce((n, a) => n + a.lessonsDone, 0)).toBe(2);
  });
});

describe('POST /api/activity/heartbeat', () => {
  it('adds clamped seconds to today', async () => {
    setClock('2026-10-25T03:00:00Z');
    let r = await beat({ seconds: 30 });
    expect(r.statusCode).toBe(200);
    expect(r.json<HeartbeatResponse>()).toEqual({ added: 30, secondsToday: 30 });
    r = await beat({ seconds: 600 });
    expect(r.json<HeartbeatResponse>()).toEqual({ added: 60, secondsToday: 90 });
    r = await beat({ seconds: -5 });
    expect(r.json<HeartbeatResponse>()).toEqual({ added: 0, secondsToday: 90 });
    expect((await beat({ seconds: 'x' })).statusCode).toBe(400);
    expect((await beat({})).statusCode).toBe(400);
  });

  it('accepts a sendBeacon JSON Blob body', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/activity/heartbeat',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ seconds: 12.4 }),
    });
    expect(r.json<HeartbeatResponse>()).toEqual({ added: 12, secondsToday: 102 });
  });
});

describe('GET /api/dashboard', () => {
  it('returns streak, path, words and this week', async () => {
    // Saved and reviewed word → "learning", and a review on the 25th.
    const reading = await get<LessonDetailResponse>('/api/lessons/a-new-coffee-shop');
    const run = Object.values(reading.words).find((w) => w.lemma === 'run')!;
    await t.app.inject({ method: 'POST', url: `/api/vocab/${run.id}`, payload: {} });
    await t.app.inject({ method: 'POST', url: `/api/reviews/${run.id}`, payload: { rating: 3 } });

    const total = (await get<{ lessons: unknown[] }>('/api/lessons')).lessons.length;
    const d = await get<DashboardResponse>('/api/dashboard');
    expect(d).toMatchObject({
      displayName: 'Viet',
      level: 'A2',
      date: '2026-10-25',
      streak: { days: 2, activeToday: true },
      path: { level: 'A2', completed: 2, total, percent: Math.round((2 / total) * 100) },
      words: { remembered: 1, learning: 1, known: 0 },
    });
    // `run` is in the Oxford 3000.
    expect(d.words.oxford3000).toBe(1);
    expect(d.week.dailyGoalMin).toBe(15);
    expect(d.week.days.map((x) => x.date)[0]).toBe('2026-10-19');
    expect(d.week.days.map((x) => x.minutes)).toEqual([0, 0, 0, 0, 0, 0, 2]);
    expect(d.week.totalMinutes).toBe(2);

    // Two days later the streak is gone, and a new week has started.
    setClock(new Date(clock.getTime() + 48 * HOUR).toISOString());
    const later = await get<DashboardResponse>('/api/dashboard');
    expect(later.streak).toEqual({ days: 0, activeToday: false });
    expect(later.week.totalMinutes).toBe(0);
  });

  it('uses the display name from users', async () => {
    t.db.update(users).set({ displayName: 'Lan' }).where(eq(users.id, 1)).run();
    expect((await get<DashboardResponse>('/api/dashboard')).displayName).toBe('Lan');
  });
});

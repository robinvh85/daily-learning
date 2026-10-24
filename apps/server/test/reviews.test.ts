import type {
  DueReviewsResponse,
  LessonDetailResponse,
  ReviewResponse,
  VocabListResponse,
  VocabStatsResponse,
} from '@daily-learning/shared/api';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailyActivity, reviewLogs, userWords } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './helpers/app.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let clock = new Date('2026-10-24T02:00:00Z');
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

let t: TestApp;
let reading: LessonDetailResponse;
let listening: LessonDetailResponse;
beforeAll(async () => {
  t = await createTestApp('none', { now: () => clock });
  reading = (await t.app.inject({ method: 'GET', url: '/api/lessons/a-new-coffee-shop' })).json();
  listening = (
    await t.app.inject({ method: 'GET', url: '/api/lessons/at-the-train-station' })
  ).json();
});
afterAll(() => t.close());

const word = (l: LessonDetailResponse, lemma: string) =>
  Object.values(l.words).find((w) => w.lemma === lemma)!;
const get = async <T>(url: string) => (await t.app.inject({ method: 'GET', url })).json<T>();
const due = () => get<DueReviewsResponse>('/api/reviews/due');
const stats = () => get<VocabStatsResponse>('/api/vocab/stats');
const rate = (wordId: number | string, rating: unknown) =>
  t.app.inject({ method: 'POST', url: `/api/reviews/${wordId}`, payload: { rating } });

describe('save → due → review → stats', () => {
  it('starts empty', async () => {
    const d = await due();
    expect(d).toEqual({ cards: [], counts: { due: 0, doneToday: 0 }, nextDueAt: null });
    expect(await stats()).toEqual({ total: 0, new: 0, learning: 0, known: 0, due: 0 });
  });

  it('puts a word saved on the reading page in the due queue immediately', async () => {
    const run = word(reading, 'run');
    const manage = run.senses.find((s) => s.key === 'manage')!;
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/vocab/${run.id}`,
      payload: { senseId: manage.id, sourceLessonId: reading.lesson.id },
    });
    expect(res.statusCode).toBe(201);

    const d = await due();
    expect(d.counts).toEqual({ due: 1, doneToday: 0 });
    expect(d.cards).toHaveLength(1);
    const card = d.cards[0]!;
    expect(card).toMatchObject({
      wordId: run.id,
      lemma: 'run',
      ipaUs: run.ipaUs,
      pos: 'verb',
      meaningVi: manage.meaningVi,
      example: manage.example,
      sourceLesson: { slug: 'a-new-coffee-shop', kind: 'reading', title: 'A New Coffee Shop' },
      status: 'new',
      due: clock.toISOString(),
    });
    expect(card.audioUrl === null || card.audioUrl.startsWith('/content/words/')).toBe(true);
    expect(card.previews.map((p) => [p.rating, p.interval])).toEqual([
      [1, '1 phút'],
      [2, '6 phút'],
      [3, '10 phút'],
      [4, expect.stringMatching(/^\d+ ngày$/)],
    ]);
    expect(await stats()).toMatchObject({ total: 1, new: 1, due: 1 });
  });

  it('also queues a word saved on the listening page, without a sense', async () => {
    const platform = word(listening, 'platform');
    advance(MIN);
    await t.app.inject({
      method: 'POST',
      url: `/api/vocab/${platform.id}`,
      payload: { sourceLessonId: listening.lesson.id },
    });
    const d = await due();
    expect(d.cards.map((c) => c.lemma)).toEqual(['run', 'platform']); // ordered by due
    expect(d.cards[1]).toMatchObject({
      meaningVi: platform.senses[0]!.meaningVi,
      sourceLesson: { kind: 'listening' },
    });
    expect((await get<DueReviewsResponse>('/api/reviews/due?limit=1')).cards).toHaveLength(1);
    expect((await get<DueReviewsResponse>('/api/reviews/due?limit=1')).counts.due).toBe(2);
  });

  it('reviews a card: FSRS schedule, log, daily activity', async () => {
    const run = word(reading, 'run');
    const res = await rate(run.id, 3);
    expect(res.statusCode).toBe(200);
    const body = res.json<ReviewResponse>();
    expect(body.card).toMatchObject({ state: 1, status: 'learning', reps: 1, lapses: 0 });
    expect(new Date(body.card.due).getTime() - clock.getTime()).toBe(10 * MIN);
    expect(body.counts).toEqual({ due: 1, doneToday: 1 });

    const d = await due();
    expect(d.cards.map((c) => c.lemma)).toEqual(['platform']);
    expect(d.nextDueAt).toBe(body.card.due);
    expect(t.db.select().from(reviewLogs).all()).toMatchObject([
      { wordId: run.id, rating: 3, state: 0, elapsedDays: 0 },
    ]);
    expect(t.db.select().from(dailyActivity).get()).toMatchObject({
      date: '2026-10-24',
      reviewsDone: 1,
    });
  });

  it('brings the card back when it is due and graduates it to Review', async () => {
    const run = word(reading, 'run');
    advance(10 * MIN);
    expect((await due()).cards.map((c) => c.lemma)).toEqual(['platform', 'run']);
    const body = (await rate(run.id, 3)).json<ReviewResponse>();
    expect(body.card.state).toBe(2);
    expect(body.card.scheduledDays).toBeGreaterThanOrEqual(1);
    const row = t.db.select().from(userWords).where(eq(userWords.wordId, run.id)).get()!;
    expect(row.due.toISOString()).toBe(body.card.due);
    expect(row.lastReview?.toISOString()).toBe(clock.toISOString());
  });

  it('counts a lapse when a Review card is forgotten', async () => {
    const run = word(reading, 'run');
    const row = t.db.select().from(userWords).where(eq(userWords.wordId, run.id)).get()!;
    clock = row.due;
    const body = (await rate(run.id, 1)).json<ReviewResponse>();
    expect(body.card).toMatchObject({ state: 3, lapses: 1, status: 'learning' });
    expect(new Date(body.card.due).getTime() - clock.getTime()).toBe(10 * MIN);
  });

  it('resets doneToday on the next local day', async () => {
    advance(2 * DAY);
    expect((await due()).counts.doneToday).toBe(0);
  });

  it('filters the word book by source and status', async () => {
    const list = (qs: string) =>
      get<VocabListResponse>(`/api/vocab${qs}`).then((r) => r.items.map((i) => i.lemma));
    expect((await list('')).sort()).toEqual(['platform', 'run']);
    expect(await list('?source=read')).toEqual(['run']);
    expect(await list('?source=listen')).toEqual(['platform']);
    expect(await list('?status=new')).toEqual(['platform']);
    expect(await list('?status=learning')).toEqual(['run']);
    expect(await list('?status=known')).toEqual([]);
    expect(await list('?source=listen&status=learning')).toEqual([]);
    const items = (await get<VocabListResponse>('/api/vocab?source=read')).items;
    expect(items[0]).toMatchObject({ status: 'learning', sourceLesson: { kind: 'reading' } });
    expect(await stats()).toEqual({ total: 2, new: 1, learning: 1, known: 0, due: 2 });
  });

  it('removing a word takes it out of the queue and the stats', async () => {
    const platform = word(listening, 'platform');
    await t.app.inject({ method: 'DELETE', url: `/api/vocab/${platform.id}` });
    expect((await due()).cards.map((c) => c.lemma)).toEqual(['run']);
    expect(await stats()).toMatchObject({ total: 1, new: 0 });
  });
});

describe('validation', () => {
  it('rejects bad ratings, unknown words and bad queries', async () => {
    const run = word(reading, 'run');
    expect((await rate(run.id, 0)).statusCode).toBe(400);
    expect((await rate(run.id, 5)).statusCode).toBe(400);
    expect((await rate(run.id, '3')).statusCode).toBe(400);
    expect((await rate('abc', 3)).statusCode).toBe(400);
    // Not saved.
    expect((await rate(word(reading, 'owner').id, 3)).statusCode).toBe(404);
    for (const url of [
      '/api/reviews/due?limit=0',
      '/api/reviews/due?limit=abc',
      '/api/vocab?source=video',
      '/api/vocab?status=done',
    ]) {
      expect((await t.app.inject({ method: 'GET', url })).statusCode, url).toBe(400);
    }
  });
});

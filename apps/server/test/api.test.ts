import type {
  AnswerResponse,
  LessonDetailResponse,
  LessonListResponse,
  ProgressResponse,
  SavedWordsResponse,
} from '@daily-learning/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { answers, dictationItems, lessonProgress, userWords } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './helpers/app.js';

let t: TestApp;
let reading: LessonDetailResponse;
beforeAll(async () => {
  t = await createTestApp();
  reading = (await t.app.inject({ method: 'GET', url: '/api/lessons/a-new-coffee-shop' })).json();
});
afterAll(() => t.close());

const wordByLemma = (lemma: string) => Object.values(reading.words).find((w) => w.lemma === lemma)!;

describe('GET /api/lessons', () => {
  it('lists every lesson', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/lessons' });
    expect(res.statusCode).toBe(200);
    const { lessons } = res.json<LessonListResponse>();
    expect(lessons.map((l) => l.slug).sort()).toEqual([
      'a-new-coffee-shop',
      'at-the-train-station',
    ]);
  });

  it('filters by kind and level', async () => {
    const get = async (qs: string) =>
      (await t.app.inject({ method: 'GET', url: `/api/lessons?${qs}` })).json<LessonListResponse>()
        .lessons;
    expect((await get('kind=listening')).map((l) => l.slug)).toEqual(['at-the-train-station']);
    expect(await get('level=B1')).toEqual([]);
    expect((await get('kind=reading&level=A2'))[0]).toMatchObject({
      slug: 'a-new-coffee-shop',
      title: 'A New Coffee Shop',
      progress: null,
    });
  });

  it('rejects invalid filters', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/lessons?kind=video' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_request' });
  });
});

describe('GET /api/lessons/:slug', () => {
  it('returns segments with tokens that all resolve to a word and sense', () => {
    expect(reading.lesson.slug).toBe('a-new-coffee-shop');
    expect(reading.segments).toHaveLength(13);
    expect(reading.segments[0]).toMatchObject({ key: 'p1s1', paragraphIdx: 0 });
    for (const seg of reading.segments) {
      expect(seg.textVi).toBeTruthy();
      for (const tok of seg.tokens) {
        expect(seg.textEn.slice(tok.start, tok.end)).toBe(tok.surface);
        const word = reading.words[tok.wordId];
        expect(word).toBeDefined();
        expect(word!.senses.some((s) => s.id === tok.senseId)).toBe(true);
      }
    }
  });

  it('uses the sense chosen for the context', () => {
    const run = wordByLemma('run');
    const tok = reading.segments.flatMap((s) => s.tokens).find((x) => x.wordId === run.id)!;
    const sense = run.senses.find((s) => s.id === tok.senseId)!;
    expect(sense.key).toBe('manage');
    expect(run.ipaUs).toMatch(/^\/.+\/$/);
  });

  it('returns the 8 focus words', () => {
    const lemmas = reading.focusWords.map((f) => reading.words[f.wordId]!.lemma);
    expect(lemmas).toEqual([
      'open',
      'owner',
      'run',
      'comfortable',
      'borrow',
      'reasonable',
      'regular',
      'atmosphere',
    ]);
  });

  it('never sends the correct answers', async () => {
    expect(reading.questions).toHaveLength(3);
    for (const q of reading.questions) {
      expect(Object.keys(q).sort()).toEqual([
        'evidenceSegmentId',
        'id',
        'idx',
        'options',
        'prompt',
      ]);
    }
    const listening = (
      await t.app.inject({ method: 'GET', url: '/api/lessons/at-the-train-station' })
    ).json<LessonDetailResponse>();
    expect(listening.dictation.length).toBeGreaterThan(0);
    for (const d of listening.dictation) {
      expect(Object.keys(d).sort()).toEqual(['afterText', 'beforeText', 'id', 'idx', 'segmentId']);
    }
    expect(listening.segments[0]!.speaker).toBe('A');
  });

  it('returns 404 for an unknown lesson and 400 for a bad slug', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/lessons/nope' })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/api/lessons/Bad_Slug' })).statusCode).toBe(
      400,
    );
  });
});

describe('POST /api/lessons/:slug/answers', () => {
  const answer = (payload: object, slug = 'a-new-coffee-shop') =>
    t.app.inject({ method: 'POST', url: `/api/lessons/${slug}/answers`, payload });

  it('grades a question on the server and stores the answer', async () => {
    const q = reading.questions[0]!; // "Where is the coffee shop?" → index 1
    const wrong = await answer({ questionId: q.id, value: 0 });
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json<AnswerResponse>()).toEqual({
      correct: false,
      feedback: 'Chưa đúng. Đọc lại câu thứ hai của đoạn 1.',
    });
    const right = (await answer({ questionId: q.id, value: 1 })).json<AnswerResponse>();
    expect(right.correct).toBe(true);
    expect(right.feedback).toMatch(/^Đúng/);
    const rows = t.db.select().from(answers).all();
    expect(rows.map((r) => [r.questionId, r.value, r.correct])).toEqual([
      [q.id, '0', false],
      [q.id, '1', true],
    ]);
  });

  it('grades dictation ignoring case and punctuation', async () => {
    const listening = (
      await t.app.inject({ method: 'GET', url: '/api/lessons/at-the-train-station' })
    ).json<LessonDetailResponse>();
    const d = listening.dictation[0]!;
    const wrong = (
      await answer({ dictationItemId: d.id, value: 'zzz' }, 'at-the-train-station')
    ).json<AnswerResponse>();
    expect(wrong.correct).toBe(false);
    const stored = t.db.select().from(dictationItems).where(eq(dictationItems.id, d.id)).get()!;
    const right = (
      await answer(
        { dictationItemId: d.id, value: ` ${stored.answer.toUpperCase()}! ` },
        'at-the-train-station',
      )
    ).json<AnswerResponse>();
    expect(right.correct).toBe(true);
  });

  it('validates the body and the question', async () => {
    const q = reading.questions[0]!;
    expect((await answer({ questionId: q.id, value: 9 })).statusCode).toBe(400);
    expect((await answer({ questionId: q.id })).statusCode).toBe(400);
    expect((await answer({ questionId: 99999, value: 0 })).statusCode).toBe(404);
    // A question from another lesson.
    expect((await answer({ questionId: q.id, value: 0 }, 'at-the-train-station')).statusCode).toBe(
      404,
    );
  });
});

describe('POST /api/lessons/:slug/progress', () => {
  const post = (payload: object) =>
    t.app.inject({ method: 'POST', url: '/api/lessons/a-new-coffee-shop/progress', payload });

  it('updates the step, never goes backwards, and completes the lesson', async () => {
    let res = await post({ step: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json<ProgressResponse>().progress).toMatchObject({ status: 'in_progress', step: 1 });
    res = await post({ step: 0 });
    expect(res.json<ProgressResponse>().progress.step).toBe(1);
    res = await post({ step: 2, status: 'completed', score: 2 / 3 });
    const p = res.json<ProgressResponse>().progress;
    expect(p).toMatchObject({ status: 'completed', step: 2 });
    expect(p.score).toBeCloseTo(0.667, 2);
    expect(p.completedAt).not.toBeNull();
    expect(t.db.select().from(lessonProgress).all()).toHaveLength(1);

    const list = (
      await t.app.inject({ method: 'GET', url: '/api/lessons?kind=reading' })
    ).json<LessonListResponse>();
    expect(list.lessons[0]!.progress?.status).toBe('completed');
  });

  it('validates the body', async () => {
    expect((await post({ step: -1 })).statusCode).toBe(400);
    expect((await post({ step: 1, status: 'done' })).statusCode).toBe(400);
  });
});

describe('vocab', () => {
  const saved = async (qs = '?lesson=a-new-coffee-shop') =>
    (await t.app.inject({ method: 'GET', url: `/api/vocab/saved${qs}` })).json<SavedWordsResponse>()
      .wordIds;

  it('saves a word as a new FSRS card, lists it and removes it', async () => {
    const run = wordByLemma('run');
    const sense = run.senses.find((s) => s.key === 'manage')!;
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/vocab/${run.id}`,
      payload: { senseId: sense.id, sourceLessonId: reading.lesson.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ wordId: run.id, senseId: sense.id, saved: true });

    const row = t.db.select().from(userWords).all()[0]!;
    expect(row).toMatchObject({
      wordId: run.id,
      senseId: sense.id,
      sourceLessonId: reading.lesson.id,
      state: 0,
      reps: 0,
    });

    // Saving again keeps the card.
    const again = await t.app.inject({ method: 'POST', url: `/api/vocab/${run.id}`, payload: {} });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ senseId: sense.id });

    expect(await saved()).toEqual([run.id]);
    expect(await saved('')).toEqual([run.id]);
    // "running" in the listening lesson is a form of "run".
    expect(await saved('?lesson=at-the-train-station')).toEqual([run.id]);

    const del = await t.app.inject({ method: 'DELETE', url: `/api/vocab/${run.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ saved: false });
    expect(await saved()).toEqual([]);
  });

  it('validates the word, sense and lesson', async () => {
    const run = wordByLemma('run');
    const owner = wordByLemma('owner');
    const post = (id: number | string, payload: object) =>
      t.app.inject({ method: 'POST', url: `/api/vocab/${id}`, payload });
    expect((await post(999999, {})).statusCode).toBe(404);
    expect((await post('abc', {})).statusCode).toBe(400);
    expect((await post(run.id, { senseId: owner.senses[0]!.id })).statusCode).toBe(400);
    expect((await post(run.id, { sourceLessonId: 999999 })).statusCode).toBe(404);
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/vocab/saved?lesson=nope' })).statusCode,
    ).toBe(404);
  });
});

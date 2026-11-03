import { collection, getDocs } from 'firebase/firestore';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../src/api/errors';
import * as h from '../../src/backend/handlers';
import { newLearner, reopen, repoContent, type Learner } from './helpers';

const learners: Learner[] = [];
async function learner(now?: string) {
  const l = await newLearner(now);
  learners.push(l);
  return l;
}
afterEach(async () => {
  await Promise.all(learners.splice(0).map((l) => l.close()));
});

const READING = 'a-new-coffee-shop';
const LISTENING = 'at-the-train-station';
const T0 = '2026-10-24T02:00:00Z'; // 09:00 in Ho Chi Minh City

function wordOf(lemma: string) {
  const w = repoContent().catalog.words.find((x) => x.lemma === lemma);
  if (!w) throw new Error(`no word ${lemma}`);
  return w;
}
const lessonOf = (slug: string) => repoContent().catalog.lessons.find((l) => l.slug === slug)!;

async function expectStatus(p: Promise<unknown>, status: number) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiRequestError);
  expect((err as ApiRequestError).status).toBe(status);
}

describe('lessons', () => {
  it('lists the library in order with filters and no progress yet', async () => {
    const { ctx } = await learner();
    const all = await h.listLessons(ctx, {});
    expect(all.lessons.length).toBe(repoContent().catalog.lessons.length);
    expect(all.lessons.every((l) => l.progress === null)).toBe(true);
    const reading = await h.listLessons(ctx, { kind: 'reading' });
    expect(reading.lessons.length).toBeGreaterThan(0);
    expect(reading.lessons.every((l) => l.kind === 'reading')).toBe(true);
  });

  it('returns a lesson without answers, with every token word', async () => {
    const { ctx } = await learner();
    const d = await h.getLesson(ctx, READING);
    expect(d.lesson.slug).toBe(READING);
    expect(d.segments.length).toBeGreaterThan(0);
    for (const s of d.segments) for (const t of s.tokens) expect(d.words[t.wordId]).toBeDefined();
    expect(d.questions[0]).not.toHaveProperty('correctIdx');
    await expectStatus(h.getLesson(ctx, 'no-such-lesson'), 404);
  });

  it('checks answers and logs them', async () => {
    const l = await learner();
    const data = repoContent().lessons.find((x) => x.slug === READING)!;
    const q = data.questions[0]!;
    const ok = await h.submitAnswer(l.ctx, READING, { questionId: q.id, value: q.correctIdx });
    expect(ok).toMatchObject({ correct: true, feedback: q.feedbackOk });
    const wrong = (q.correctIdx + 1) % q.options.length;
    expect(await h.submitAnswer(l.ctx, READING, { questionId: q.id, value: wrong })).toMatchObject({
      correct: false,
      expected: null,
    });
    await expectStatus(
      h.submitAnswer(l.ctx, READING, { questionId: q.id, value: q.options.length }),
      400,
    );

    const listening = repoContent().lessons.find((x) => x.slug === LISTENING)!;
    const d = listening.dictation[0]!;
    expect(
      await h.submitAnswer(l.ctx, LISTENING, {
        dictationItemId: d.id,
        value: `  ${d.answer.toUpperCase()}! `,
      }),
    ).toEqual({ correct: true, feedback: null, expected: null });
    expect(
      await h.submitAnswer(l.ctx, LISTENING, { dictationItemId: d.id, value: 'nope' }),
    ).toEqual({ correct: false, feedback: null, expected: d.answer });

    const logged = await getDocs(collection(l.db, 'users', l.uid, 'answers'));
    expect(logged.size).toBe(4);
  });

  it('saves progress: never backwards, completed once, counted once for today', async () => {
    const l = await learner(T0);
    await h.updateProgress(l.ctx, READING, { step: 2 });
    expect((await h.updateProgress(l.ctx, READING, { step: 1 })).progress).toMatchObject({
      status: 'in_progress',
      step: 2,
    });
    const done = await h.updateProgress(l.ctx, READING, { step: 2, status: 'completed', score: 1 });
    expect(done.progress).toMatchObject({ status: 'completed', score: 1 });
    expect(done.progress.completedAt).toBe(new Date(T0).toISOString());
    l.setNow('2026-10-24T03:00:00Z');
    const again = await h.updateProgress(l.ctx, READING, { step: 1, status: 'in_progress' });
    expect(again.progress).toMatchObject({ status: 'completed', step: 2 });
    expect(again.progress.completedAt).toBe(new Date(T0).toISOString());
    expect(l.store.activity.get('2026-10-24')?.lessonsDone).toBe(1);

    const reloaded = await reopen(l);
    expect(reloaded.progress.get(READING)?.status).toBe('completed');
    reloaded.dispose();
    expect(
      (await h.listLessons(l.ctx, {})).lessons.find((x) => x.slug === READING)?.progress,
    ).toMatchObject({ status: 'completed' });
  });
});

describe('vocabulary and reviews', () => {
  it('saves a word once, lists it and filters by lesson, source and status', async () => {
    const l = await learner(T0);
    const lesson = lessonOf(READING);
    const data = repoContent().lessons.find((x) => x.slug === READING)!;
    const focus = data.focusWords[0]!;
    const res = await h.saveWord(l.ctx, focus.wordId, {
      senseId: focus.senseId,
      sourceLessonId: lesson.id,
    });
    expect(res).toEqual({ wordId: focus.wordId, senseId: focus.senseId, saved: true });
    // Saving again keeps the first card and sense.
    expect(await h.saveWord(l.ctx, focus.wordId, { senseId: null })).toEqual(res);

    expect((await h.listSavedWordIds(l.ctx, READING)).wordIds).toEqual([focus.wordId]);
    expect((await h.listSavedWordIds(l.ctx, LISTENING)).wordIds).toEqual([]);
    const book = await h.listVocab(l.ctx, { source: 'read', status: 'new' });
    expect(book.items).toHaveLength(1);
    expect(book.items[0]).toMatchObject({
      wordId: focus.wordId,
      status: 'new',
      sourceLesson: { slug: READING, kind: 'reading' },
      savedAt: new Date(T0).toISOString(),
    });
    expect((await h.listVocab(l.ctx, { source: 'listen' })).items).toHaveLength(0);
    expect(await h.vocabStats(l.ctx)).toEqual({ total: 1, new: 1, learning: 0, known: 0, due: 1 });

    await expectStatus(h.saveWord(l.ctx, 1, {}), 404);
    const other = wordOf('run');
    await expectStatus(h.saveWord(l.ctx, other.id, { senseId: focus.senseId ?? 1 }), 400);

    expect(await h.removeWord(l.ctx, focus.wordId)).toMatchObject({ saved: false });
    expect((await h.listSavedWordIds(l.ctx, undefined)).wordIds).toEqual([]);
  });

  it('reviews a due card with FSRS, logs it and counts it for today', async () => {
    const l = await learner(T0);
    const w = wordOf('borrow');
    await h.saveWord(l.ctx, w.id, {});
    const due = await h.dueReviews(l.ctx);
    expect(due.cards.map((c) => c.wordId)).toEqual([w.id]);
    expect(due.counts).toEqual({ due: 1, doneToday: 0 });
    const card = due.cards[0]!;
    expect(card.previews.map((p) => p.rating)).toEqual([1, 2, 3, 4]);
    expect(card.lemma).toBe('borrow');
    expect(card.meaningVi).toBe(w.senses[0]!.meaningVi);

    const r = await h.submitReview(l.ctx, w.id, 3);
    expect(r.card.state).toBeGreaterThan(0);
    expect(new Date(r.card.due).getTime()).toBeGreaterThan(new Date(T0).getTime());
    expect(r.counts).toEqual({ due: 0, doneToday: 1 });
    expect((await h.dueReviews(l.ctx)).nextDueAt).toBe(r.card.due);

    const logs = await getDocs(collection(l.db, 'users', l.uid, 'reviewLogs'));
    expect(logs.docs.map((d) => d.data())).toMatchObject([{ lemma: 'borrow', rating: 3 }]);
    await expectStatus(h.submitReview(l.ctx, wordOf('lunch').id, 3), 404);
  });

  it('postpones a card to the start of tomorrow (Vietnam time) without a review', async () => {
    const l = await learner('2026-10-24T16:30:00Z'); // 23:30 in Vietnam
    const w = wordOf('borrow');
    await h.saveWord(l.ctx, w.id, {});
    const p = await h.postponeReview(l.ctx, w.id);
    expect(p.due).toBe('2026-10-24T17:00:00.000Z'); // 00:00 on Oct 25 in Vietnam
    expect(p.counts).toEqual({ due: 0, doneToday: 0 });
    expect((await h.getReviewCard(l.ctx, w.id)).card.due).toBe(p.due);
  });

  it('picks a lesson sentence with audio as the example when there is one', async () => {
    const l = await learner(T0);
    const ex = Object.entries(repoContent().examples.byWord)[0];
    if (!ex) return; // no lesson audio in this checkout
    const wordId = Number(ex[0]);
    await h.saveWord(l.ctx, wordId, {});
    const { card } = await h.getReviewCard(l.ctx, wordId);
    expect(card.exampleAudio).not.toBeNull();
    expect(ex[1].map((e) => e.textEn)).toContain(card.example);
  });
});

describe('home', () => {
  it('starts on day 1 and keeps the finished day until tomorrow', async () => {
    const l = await learner(T0);
    const t1 = await h.today(l.ctx);
    expect(t1).toMatchObject({ source: 'plan', day: 1, allDone: false });
    expect(t1.steps.map((s) => s.kind)).toEqual(['reading', 'listening', 'reviews']);
    expect(t1.continueUrl).toBe(`/read/${READING}`);

    await h.updateProgress(l.ctx, READING, { step: 2, status: 'completed' });
    await h.updateProgress(l.ctx, LISTENING, { step: 2, status: 'completed' });
    expect(await h.today(l.ctx)).toMatchObject({ day: 1, allDone: true, continueUrl: null });
    l.setNow('2026-10-25T02:00:00Z');
    expect((await h.today(l.ctx)).day).toBe(2);
  });

  it('builds the dashboard: streak, path and the week from study time', async () => {
    const l = await learner(T0);
    expect(await h.heartbeat(l.ctx, 45)).toEqual({ added: 45, secondsToday: 45 });
    expect(await h.heartbeat(l.ctx, 500)).toEqual({ added: 60, secondsToday: 105 });
    expect(await h.heartbeat(l.ctx, -3)).toEqual({ added: 0, secondsToday: 105 });
    await h.updateProgress(l.ctx, READING, { step: 2, status: 'completed' });

    const d = await h.dashboard(l.ctx);
    expect(d.displayName).toBe('bạn');
    expect(d.streak).toEqual({ days: 1, activeToday: true });
    expect(d.path.completed).toBe(1);
    expect(d.path.total).toBe(repoContent().catalog.lessons.filter((x) => x.level === 'A2').length);
    expect(d.week.days).toHaveLength(7);
    expect(d.week.days.find((x) => x.date === '2026-10-24')?.minutes).toBe(2);
    expect(d.week.totalMinutes).toBe(2);
  });

  it('creates the profile on first use and keeps an existing one', async () => {
    const l = await learner(T0);
    await l.store.ensureProfile('Viet');
    const r = await reopen(l);
    expect(r.profile.displayName).toBe('Viet');
    await r.ensureProfile('Someone else');
    r.dispose();
    const r2 = await reopen(l);
    expect(r2.profile.displayName).toBe('Viet');
    r2.dispose();
  });
});

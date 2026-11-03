/**
 * What used to be the REST API (plan section 5), computed in the browser from the content files
 * (`content.ts`) and the learner's Firestore data (`userStore.ts`). Every function returns the
 * response type of its `/api/*` path in `@daily-learning/shared/api`.
 */
import { HEARTBEAT_MAX_SECONDS } from '@daily-learning/shared/api';
import type {
  AnswerBody,
  AnswerResponse,
  CardStateDto,
  DashboardResponse,
  DueReviewsResponse,
  HeartbeatResponse,
  LessonDetailResponse,
  LessonListQuery,
  LessonListResponse,
  LessonProgressDto,
  LessonSummary,
  PostponeResponse,
  ProgressBody,
  ProgressResponse,
  ReviewCardDto,
  ReviewCardResponse,
  ReviewCountsDto,
  ReviewResponse,
  SavedWordResponse,
  SavedWordsResponse,
  SaveWordBody,
  SourceLessonDto,
  TodayResponse,
  TodayStepDto,
  VocabListQuery,
  VocabListResponse,
  VocabStatsResponse,
  WordDto,
} from '@daily-learning/shared/api';
import type { ReviewRating } from '@daily-learning/shared';
import type { CatalogLesson, CatalogWord, LessonData } from '@daily-learning/shared/content-data';
import { ApiRequestError } from '../api/errors';
import type { ContentIndex, ContentStore } from './content';
import {
  lessonStep,
  normalizeDictation,
  pickToday,
  reviewStep,
  type LessonState,
} from './logic/dailyPlan';
import {
  localDate,
  newCardColumns,
  previewRatings,
  review,
  startOfNextLocalDay,
  vocabStatus,
} from './logic/srs';
import { computeStreak, weekMinutes } from './logic/streak';
import type { ProgressDoc, SavedWordDoc, UserStore } from './userStore';

export interface BackendContext {
  content: ContentStore;
  store: UserStore;
  now: () => Date;
}

const notFound = (what: string) => new ApiRequestError(404, 'not_found', `${what} not found`);
const badRequest = (message: string) => new ApiRequestError(400, 'bad_request', message);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toProgress(p: ProgressDoc | undefined): LessonProgressDto | null {
  if (!p) return null;
  return {
    status: p.status,
    step: p.step,
    score: p.score,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  };
}

function summary(l: CatalogLesson, store: UserStore): LessonSummary {
  return { ...l, progress: toProgress(store.progress.get(l.slug)) };
}

function wordDto(w: CatalogWord): WordDto {
  return {
    id: w.id,
    lemma: w.lemma,
    ipaUs: w.ipaUs,
    cefr: w.cefr,
    isPhrase: w.isPhrase,
    status: w.status,
    audioUrl: w.audioUrl,
    senses: w.senses,
  };
}

function sourceLessonDto(l: CatalogLesson | undefined): SourceLessonDto | null {
  return l ? { id: l.id, slug: l.slug, kind: l.kind, title: l.title } : null;
}

/** A saved word joined with the dictionary (null when the word left the dictionary). */
interface SavedWord {
  doc: SavedWordDoc;
  word: CatalogWord;
  /** The saved sense, or the first sense. */
  sense: CatalogWord['senses'][number] | null;
  sourceLesson: CatalogLesson | undefined;
}

function joinSaved(index: ContentIndex, doc: SavedWordDoc): SavedWord | null {
  const word = index.wordByLemma.get(doc.lemma);
  if (!word) return null;
  return {
    doc,
    word,
    sense: index.sense(word, doc.sense) ?? word.senses[0] ?? null,
    sourceLesson: doc.sourceLesson ? index.lessonBySlug.get(doc.sourceLesson) : undefined,
  };
}

function savedWords(index: ContentIndex, store: UserStore): SavedWord[] {
  const out: SavedWord[] = [];
  for (const doc of store.words.values()) {
    const s = joinSaved(index, doc);
    if (s) out.push(s);
  }
  return out;
}

function savedById(index: ContentIndex, store: UserStore, wordId: number): SavedWord {
  const word = index.wordById.get(wordId);
  const doc = word && store.words.get(word.lemma);
  const s = doc && joinSaved(index, doc);
  if (!s) throw notFound(`Saved word ${wordId}`);
  return s;
}

function reviewCounts(store: UserStore, now: Date): ReviewCountsDto {
  let due = 0;
  for (const w of store.words.values()) if (w.due <= now) due++;
  return { due, doneToday: store.activity.get(localDate(now))?.reviewsDone ?? 0 };
}

async function loadLesson(
  ctx: BackendContext,
  slug: string,
): Promise<{ index: ContentIndex; lesson: CatalogLesson; data: LessonData }> {
  const index = await ctx.content.catalog();
  const lesson = index.lessonBySlug.get(slug);
  const data = lesson ? await ctx.content.lesson(slug) : null;
  if (!lesson || !data) throw notFound(`Lesson "${slug}"`);
  return { index, lesson, data };
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function listLessons(
  ctx: BackendContext,
  q: LessonListQuery,
): Promise<LessonListResponse> {
  const index = await ctx.content.catalog();
  const lessons = index.catalog.lessons.filter(
    (l) =>
      (!q.kind || l.kind === q.kind) &&
      (!q.level || l.level === q.level) &&
      (!q.topic || l.topic === q.topic),
  );
  return { lessons: lessons.map((l) => summary(l, ctx.store)) };
}

export async function getLesson(ctx: BackendContext, slug: string): Promise<LessonDetailResponse> {
  const { index, lesson, data } = await loadLesson(ctx, slug);
  const words: Record<string, WordDto> = {};
  for (const id of data.wordIds) {
    const w = index.wordById.get(id);
    if (w) words[id] = wordDto(w);
  }
  return {
    lesson: summary(lesson, ctx.store),
    segments: data.segments,
    words,
    focusWords: data.focusWords,
    questions: data.questions.map(({ id, idx, prompt, options, evidenceSegmentId }) => ({
      id,
      idx,
      prompt,
      options,
      evidenceSegmentId,
    })),
    dictation: data.dictation.map(({ id, idx, segmentId, beforeText, afterText }) => ({
      id,
      idx,
      segmentId,
      beforeText,
      afterText,
    })),
    peaks: data.peaks,
  };
}

export async function submitAnswer(
  ctx: BackendContext,
  slug: string,
  body: AnswerBody,
): Promise<AnswerResponse> {
  const { data } = await loadLesson(ctx, slug);
  const at = ctx.now();
  if ('questionId' in body) {
    const q = data.questions.find((x) => x.id === body.questionId);
    if (!q) throw notFound(`Question ${body.questionId}`);
    if (!Number.isInteger(body.value) || body.value < 0 || body.value >= q.options.length) {
      throw badRequest(`value must be an option index below ${q.options.length}`);
    }
    const correct = body.value === q.correctIdx;
    await ctx.store.addAnswer({
      lesson: slug,
      question: q.idx,
      dictation: null,
      value: String(body.value),
      correct,
      at,
    });
    return {
      correct,
      feedback: (correct ? q.feedbackOk : q.feedbackWrong) ?? null,
      expected: null,
    };
  }
  const d = data.dictation.find((x) => x.id === body.dictationItemId);
  if (!d) throw notFound(`Dictation item ${body.dictationItemId}`);
  const value = body.value.slice(0, 200);
  const correct = normalizeDictation(value) === normalizeDictation(d.answer);
  await ctx.store.addAnswer({ lesson: slug, question: null, dictation: d.idx, value, correct, at });
  return { correct, feedback: null, expected: correct ? null : d.answer };
}

export async function updateProgress(
  ctx: BackendContext,
  slug: string,
  body: ProgressBody,
): Promise<ProgressResponse> {
  await loadLesson(ctx, slug);
  const t = ctx.now();
  const prev = ctx.store.progress.get(slug);
  // A completed lesson stays completed; the step never goes backwards.
  const wasCompleted = prev?.status === 'completed';
  const status = wasCompleted ? 'completed' : (body.status ?? 'in_progress');
  const next: ProgressDoc = {
    status,
    step: Math.max(prev?.step ?? 0, body.step),
    score: body.score === undefined ? (prev?.score ?? null) : body.score,
    completedAt: status === 'completed' ? (prev?.completedAt ?? t) : null,
    updatedAt: t,
  };
  // Counted once: only the transition to completed adds to today's lessonsDone.
  await ctx.store.saveProgress(slug, next, status === 'completed' && !wasCompleted, t);
  return { progress: toProgress(next)! };
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export async function saveWord(
  ctx: BackendContext,
  wordId: number,
  body: SaveWordBody,
): Promise<SavedWordResponse> {
  const index = await ctx.content.catalog();
  const word = index.wordById.get(wordId);
  if (!word) throw notFound(`Word ${wordId}`);
  const senseId = body.senseId ?? null;
  const sense = senseId === null ? null : word.senses.find((s) => s.id === senseId);
  if (sense === undefined) throw badRequest(`Sense ${senseId} does not belong to word ${wordId}`);
  const sourceId = body.sourceLessonId ?? null;
  const source = sourceId === null ? null : index.lessonById.get(sourceId);
  if (source === undefined) throw notFound(`Lesson ${sourceId}`);

  // Saving twice keeps the existing card (and its review history).
  const existing = ctx.store.words.get(word.lemma);
  if (existing) {
    const s = index.sense(word, existing.sense);
    return { wordId, senseId: s?.id ?? null, saved: true };
  }
  const t = ctx.now();
  await ctx.store.saveWord({
    lemma: word.lemma,
    sense: sense?.key ?? null,
    sourceLesson: source?.slug ?? null,
    ...newCardColumns(t),
    createdAt: t,
  });
  return { wordId, senseId: sense?.id ?? null, saved: true };
}

export async function removeWord(ctx: BackendContext, wordId: number): Promise<SavedWordResponse> {
  const index = await ctx.content.catalog();
  const word = index.wordById.get(wordId);
  if (word && ctx.store.words.has(word.lemma)) await ctx.store.removeWord(word.lemma);
  return { wordId, senseId: null, saved: false };
}

export async function listSavedWordIds(
  ctx: BackendContext,
  lessonSlug: string | undefined,
): Promise<SavedWordsResponse> {
  const index = await ctx.content.catalog();
  let inLesson: Set<number> | null = null;
  if (lessonSlug !== undefined) {
    // Words that appear in the lesson text or in its focus list.
    inLesson = new Set((await loadLesson(ctx, lessonSlug)).data.wordIds);
  }
  const ids = savedWords(index, ctx.store)
    .map((s) => s.word.id)
    .filter((id) => !inLesson || inLesson.has(id));
  return { wordIds: ids.sort((a, b) => a - b) };
}

/**
 * Word book. `source` is the kind of the lesson the word was saved from (words saved without a
 * lesson only appear under `all`). Newest first.
 */
export async function listVocab(
  ctx: BackendContext,
  q: VocabListQuery,
): Promise<VocabListResponse> {
  const index = await ctx.content.catalog();
  const source = q.source ?? 'all';
  const status = q.status ?? 'all';
  const kind = source === 'read' ? 'reading' : source === 'listen' ? 'listening' : null;
  const items = savedWords(index, ctx.store)
    .map((s) => ({ s, status: vocabStatus(s.doc.state, s.doc.stability) }))
    .filter(({ s, status: st }) => {
      if (kind && s.sourceLesson?.kind !== kind) return false;
      return status === 'all' || st === status;
    })
    .sort(
      (a, b) =>
        b.s.doc.createdAt.getTime() - a.s.doc.createdAt.getTime() ||
        a.s.word.lemma.localeCompare(b.s.word.lemma),
    );
  return {
    items: items.map(({ s, status: st }) => ({
      wordId: s.word.id,
      lemma: s.word.lemma,
      meaningVi: s.sense?.meaningVi ?? '',
      status: st,
      sourceLesson: sourceLessonDto(s.sourceLesson),
      due: s.doc.due.toISOString(),
      savedAt: s.doc.createdAt.toISOString(),
    })),
  };
}

function statsOf(store: UserStore, now: Date): VocabStatsResponse {
  const stats = { new: 0, learning: 0, known: 0 };
  for (const w of store.words.values()) stats[vocabStatus(w.state, w.stability)]++;
  return {
    total: stats.new + stats.learning + stats.known,
    ...stats,
    due: reviewCounts(store, now).due,
  };
}

export async function vocabStats(ctx: BackendContext): Promise<VocabStatsResponse> {
  return statsOf(ctx.store, ctx.now());
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** A saved word as a review card, with a preview of the 4 ratings at `t`. */
async function reviewCard(ctx: BackendContext, s: SavedWord, t: Date): Promise<ReviewCardDto> {
  // Prefer a sentence the learner met in a lesson, so it can be played from the lesson audio:
  // the source lesson first, then the saved sense, then library order.
  const examples = (await ctx.content.examples()).byWord[s.word.id] ?? [];
  const sourceId = s.sourceLesson?.id ?? null;
  const senseId = s.sense?.id ?? null;
  const rank = (e: (typeof examples)[number]) =>
    (e.lessonId === sourceId ? 2 : 0) + (e.senseId === senseId ? 1 : 0);
  let ex = examples[0];
  for (const e of examples) if (ex && rank(e) > rank(ex)) ex = e;
  return {
    wordId: s.word.id,
    lemma: s.word.lemma,
    ipaUs: s.word.ipaUs,
    pos: s.sense?.pos ?? '',
    meaningVi: s.sense?.meaningVi ?? '',
    example: ex?.textEn ?? s.sense?.example ?? '',
    exampleAudio: ex ? { url: ex.audioUrl, startMs: ex.startMs, endMs: ex.endMs } : null,
    sourceLesson: sourceLessonDto(s.sourceLesson),
    audioUrl: s.word.audioUrl,
    status: vocabStatus(s.doc.state, s.doc.stability),
    due: s.doc.due.toISOString(),
    previews: previewRatings(s.doc, t).map((p) => ({
      rating: p.rating,
      due: p.due.toISOString(),
      interval: p.interval,
    })),
  };
}

/** Cards due now (due ≤ now), oldest first, with a preview of the 4 ratings. */
export async function dueReviews(ctx: BackendContext, limit = 50): Promise<DueReviewsResponse> {
  const index = await ctx.content.catalog();
  const t = ctx.now();
  const all = savedWords(index, ctx.store);
  const due = all
    .filter((s) => s.doc.due <= t)
    .sort((a, b) => a.doc.due.getTime() - b.doc.due.getTime() || a.word.id - b.word.id)
    .slice(0, Math.min(200, Math.max(1, Math.floor(limit))));
  let next: Date | null = null;
  for (const w of ctx.store.words.values()) {
    if (w.due > t && (!next || w.due < next)) next = w.due;
  }
  return {
    cards: await Promise.all(due.map((s) => reviewCard(ctx, s, t))),
    counts: reviewCounts(ctx.store, t),
    nextDueAt: next ? next.toISOString() : null,
  };
}

/** One saved word as a card, due or not: reviewing a word picked from the word book. */
export async function getReviewCard(
  ctx: BackendContext,
  wordId: number,
): Promise<ReviewCardResponse> {
  const index = await ctx.content.catalog();
  return { card: await reviewCard(ctx, savedById(index, ctx.store, wordId), ctx.now()) };
}

/**
 * "Mai ôn": the card is due again at the start of tomorrow. Only `due` moves: no FSRS review,
 * no log, no activity, so tomorrow's rating is scheduled from the real memory state.
 */
export async function postponeReview(
  ctx: BackendContext,
  wordId: number,
): Promise<PostponeResponse> {
  const index = await ctx.content.catalog();
  const s = savedById(index, ctx.store, wordId);
  const t = ctx.now();
  const due = startOfNextLocalDay(t);
  await ctx.store.postponeWord(s.word.lemma, due);
  return { wordId, due: due.toISOString(), counts: reviewCounts(ctx.store, t) };
}

/** Rate a saved word: FSRS computes the next schedule; every review is logged. */
export async function submitReview(
  ctx: BackendContext,
  wordId: number,
  rating: ReviewRating,
): Promise<ReviewResponse> {
  if (![1, 2, 3, 4].includes(rating)) throw badRequest('rating must be 1, 2, 3 or 4');
  const index = await ctx.content.catalog();
  const s = savedById(index, ctx.store, wordId);
  const t = ctx.now();
  const result = review(s.doc, rating, t);
  await ctx.store.recordReview(s.word.lemma, result, t);
  const c = result.card;
  const card: CardStateDto = {
    due: c.due.toISOString(),
    state: c.state,
    status: vocabStatus(c.state, c.stability),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    lastReview: c.lastReview?.toISOString() ?? null,
  };
  return { wordId, rating, card, counts: reviewCounts(ctx.store, t) };
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export async function today(ctx: BackendContext): Promise<TodayResponse> {
  const index = await ctx.content.catalog();
  const now = ctx.now();
  const date = localDate(now);
  const states: LessonState[] = index.catalog.lessons.map((l) => {
    const p = ctx.store.progress.get(l.slug);
    return {
      id: l.id,
      kind: l.kind,
      level: l.level,
      orderIndex: l.orderIndex,
      title: l.title,
      completed: p?.status === 'completed',
      completedAt: p?.completedAt ?? null,
    };
  });
  const idOf = (slug: string | null) => (slug ? (index.lessonBySlug.get(slug)?.id ?? null) : null);
  const planDays = index.catalog.plan.map((d) => ({
    day: d.day,
    title: d.title,
    readingLessonId: idOf(d.reading),
    listeningLessonId: idOf(d.listening),
  }));
  const pick = pickToday(planDays, states, date);

  const steps: TodayStepDto[] = [];
  if (pick.source !== 'finished') {
    for (const id of [pick.readingId, pick.listeningId]) {
      const l = id === null ? undefined : index.lessonById.get(id);
      if (l) steps.push(lessonStep(summary(l, ctx.store)));
    }
  }
  steps.push(reviewStep(reviewCounts(ctx.store, now)));

  const open = steps.filter((s) => s.status !== 'done');
  const title =
    pick.source === 'plan'
      ? (pick.title ?? `Ngày ${pick.day}`)
      : pick.source === 'fallback'
        ? 'Bài tiếp theo trong thư viện'
        : 'Đã học hết bài hiện có';
  return {
    date,
    source: pick.source,
    day: pick.source === 'finished' ? null : pick.day,
    title,
    steps,
    estimatedMinutes: open.reduce((n, s) => n + s.minutes, 0),
    continueUrl: open[0]?.url ?? null,
    allDone: open.length === 0,
  };
}

/** Home statistics: streak, path progress, words, this week. */
export async function dashboard(ctx: BackendContext): Promise<DashboardResponse> {
  const index = await ctx.content.catalog();
  const now = ctx.now();
  const date = localDate(now);
  const { profile } = ctx.store;
  const level = profile.level;

  const activity = [...ctx.store.activity.values()].filter((d) => d.date <= date);
  const week = weekMinutes(activity, date);

  // Path A2 → B1: completed lessons of the user's current level / all lessons of that level.
  const ofLevel = index.catalog.lessons.filter((l) => l.level === level);
  const completed = ofLevel.filter(
    (l) => ctx.store.progress.get(l.slug)?.status === 'completed',
  ).length;

  // Remembered = learning + known (FSRS state Learning, Review or Relearning).
  const stats = statsOf(ctx.store, now);
  let oxford = 0;
  for (const w of ctx.store.words.values()) {
    if ([1, 2, 3].includes(w.state) && index.wordByLemma.get(w.lemma)?.oxford3000) oxford++;
  }

  return {
    displayName: profile.displayName,
    level,
    date,
    streak: computeStreak(activity, date),
    path: {
      level,
      completed,
      total: ofLevel.length,
      percent: ofLevel.length > 0 ? Math.round((completed / ofLevel.length) * 100) : 0,
    },
    words: {
      remembered: stats.known + stats.learning,
      known: stats.known,
      learning: stats.learning,
      oxford3000: oxford,
    },
    week: {
      totalMinutes: Math.round(week.reduce((n, d) => n + d.seconds, 0) / 60),
      dailyGoalMin: profile.dailyGoalMin,
      days: week.map(({ date: d, minutes }) => ({ date: d, minutes })),
    },
  };
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/** Heartbeat seconds: rounded and clamped to 0..60 (NaN/negative → 0). */
export function clampHeartbeatSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(HEARTBEAT_MAX_SECONDS, Math.round(seconds));
}

export async function heartbeat(ctx: BackendContext, seconds: number): Promise<HeartbeatResponse> {
  const t = ctx.now();
  const added = clampHeartbeatSeconds(seconds);
  const before = ctx.store.activity.get(localDate(t))?.secondsStudied ?? 0;
  if (added > 0) await ctx.store.addStudySeconds(added, t);
  return { added, secondsToday: before + added };
}

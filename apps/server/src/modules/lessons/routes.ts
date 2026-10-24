/** Lessons API (plan section 5): library list, lesson content, answers and progress. */
import { API_PREFIX } from '@daily-learning/shared';
import {
  answerBodySchema,
  lessonListQuerySchema,
  lessonSlugParamsSchema,
  progressBodySchema,
  type AnswerResponse,
  type LessonDetailResponse,
  type LessonListResponse,
  type LessonProgressDto,
  type LessonSummary,
  type ProgressResponse,
  type SegmentDto,
  type WordDto,
} from '@daily-learning/shared/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import {
  answers,
  dictationItems,
  lessonProgress,
  lessons,
  lessonTokens,
  lessonWords,
  questions,
  segments,
  words,
  wordSenses,
} from '../../db/schema.js';
import { HttpError, notFound, parseInput } from '../../http.js';
import { recordActivity } from '../../services/activity.js';
import { systemClock, type Clock } from '../../services/srs.js';
import { requireUser } from '../auth/routes.js';
import { CONTENT_PREFIX } from '../static/routes.js';

type LessonRow = typeof lessons.$inferSelect;
type ProgressRow = typeof lessonProgress.$inferSelect;

function toProgress(p: ProgressRow | undefined | null): LessonProgressDto | null {
  if (!p) return null;
  return {
    status: p.status,
    step: p.step,
    score: p.score,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  };
}

export function toSummary(l: LessonRow, p: ProgressRow | undefined | null): LessonSummary {
  return {
    id: l.id,
    slug: l.slug,
    kind: l.kind,
    level: l.level,
    title: l.title,
    topic: l.topic,
    wordCount: l.wordCount,
    durationMs: l.durationMs,
    audioUrl: contentUrl(l.audioPath, l.audioVersion),
    orderIndex: l.orderIndex,
    progress: toProgress(p),
  };
}

/** Web route of a lesson page. */
export function lessonHref(l: { kind: 'reading' | 'listening'; slug: string }): string {
  return `${l.kind === 'reading' ? '/read' : '/listen'}/${l.slug}`;
}

/** Public URL of a file under `content/` (served by `@fastify/static`, see app.ts). */
export function contentUrl(path: string | null, version: string | null): string | null {
  if (!path) return null;
  const url = `${CONTENT_PREFIX}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return version ? `${url}?v=${version}` : url;
}

/** Lowercase, drop punctuation and extra spaces (dictation matching, plan Phase 3). */
export function normalizeDictation(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lessonRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  now: Clock = systemClock,
): void {
  function findLesson(slug: string): LessonRow {
    const l = db.select().from(lessons).where(eq(lessons.slug, slug)).get();
    if (!l) throw notFound(`Lesson "${slug}"`);
    return l;
  }

  function findProgress(userId: number, lessonId: number): ProgressRow | undefined {
    return db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
      .get();
  }

  app.get(`${API_PREFIX}/lessons`, async (request): Promise<LessonListResponse> => {
    const user = requireUser(request);
    const q = parseInput(lessonListQuerySchema, request.query);
    const conds = [];
    if (q.kind) conds.push(eq(lessons.kind, q.kind));
    if (q.level) conds.push(eq(lessons.level, q.level));
    if (q.topic) conds.push(eq(lessons.topic, q.topic));
    const rows = db
      .select({ lesson: lessons, progress: lessonProgress })
      .from(lessons)
      .leftJoin(
        lessonProgress,
        and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, user.id)),
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(lessons.level), asc(lessons.orderIndex), asc(lessons.title))
      .all();
    return { lessons: rows.map((r) => toSummary(r.lesson, r.progress)) };
  });

  app.get(`${API_PREFIX}/lessons/:slug`, async (request): Promise<LessonDetailResponse> => {
    const user = requireUser(request);
    const { slug } = parseInput(lessonSlugParamsSchema, request.params);
    const lesson = findLesson(slug);

    const segRows = db
      .select()
      .from(segments)
      .where(eq(segments.lessonId, lesson.id))
      .orderBy(asc(segments.idx))
      .all();
    const tokenRows = db
      .select()
      .from(lessonTokens)
      .where(eq(lessonTokens.lessonId, lesson.id))
      .orderBy(asc(lessonTokens.segmentId), asc(lessonTokens.idx))
      .all();
    const focusRows = db
      .select()
      .from(lessonWords)
      .where(eq(lessonWords.lessonId, lesson.id))
      .orderBy(asc(lessonWords.idx))
      .all();

    const tokensBySeg = new Map<number, SegmentDto['tokens']>();
    for (const t of tokenRows) {
      const list = tokensBySeg.get(t.segmentId) ?? [];
      list.push({
        idx: t.idx,
        surface: t.surface,
        start: t.startChar,
        end: t.endChar,
        wordId: t.wordId,
        senseId: t.senseId,
      });
      tokensBySeg.set(t.segmentId, list);
    }

    const wordIds = [...new Set([...tokenRows, ...focusRows].map((t) => t.wordId))];
    const wordMap: Record<string, WordDto> = {};
    if (wordIds.length > 0) {
      for (const w of db.select().from(words).where(inArray(words.id, wordIds)).all()) {
        wordMap[w.id] = {
          id: w.id,
          lemma: w.lemma,
          ipaUs: w.ipaUs,
          cefr: w.cefr,
          isPhrase: w.isPhrase,
          status: w.status,
          audioUrl: contentUrl(w.audioPath, w.audioVersion),
          senses: [],
        };
      }
      const senseRows = db
        .select()
        .from(wordSenses)
        .where(inArray(wordSenses.wordId, wordIds))
        .orderBy(asc(wordSenses.wordId), asc(wordSenses.idx))
        .all();
      for (const s of senseRows) {
        wordMap[s.wordId]?.senses.push({
          id: s.id,
          key: s.key,
          pos: s.pos,
          meaningVi: s.meaningVi,
          definitionEn: s.definitionEn,
          collocations: s.collocations,
          example: s.example,
        });
      }
    }

    const questionRows = db
      .select({
        id: questions.id,
        idx: questions.idx,
        prompt: questions.prompt,
        options: questions.options,
        evidenceSegmentId: questions.evidenceSegmentId,
      })
      .from(questions)
      .where(eq(questions.lessonId, lesson.id))
      .orderBy(asc(questions.idx))
      .all();
    const dictationRows = db
      .select({
        id: dictationItems.id,
        idx: dictationItems.idx,
        segmentId: dictationItems.segmentId,
        beforeText: dictationItems.beforeText,
        afterText: dictationItems.afterText,
      })
      .from(dictationItems)
      .where(eq(dictationItems.lessonId, lesson.id))
      .orderBy(asc(dictationItems.idx))
      .all();

    return {
      lesson: toSummary(lesson, findProgress(user.id, lesson.id)),
      segments: segRows.map((s) => ({
        id: s.id,
        key: s.key,
        idx: s.idx,
        paragraphIdx: s.paragraphIdx,
        speaker: s.speaker,
        textEn: s.textEn,
        textVi: s.textVi,
        startMs: s.startMs,
        endMs: s.endMs,
        tokens: tokensBySeg.get(s.id) ?? [],
      })),
      words: wordMap,
      focusWords: focusRows.map((f) => ({ wordId: f.wordId, senseId: f.senseId })),
      questions: questionRows,
      dictation: dictationRows,
      peaks: lesson.audioPath ? lesson.peaks : null,
    };
  });

  app.post(`${API_PREFIX}/lessons/:slug/answers`, async (request): Promise<AnswerResponse> => {
    const user = requireUser(request);
    const { slug } = parseInput(lessonSlugParamsSchema, request.params);
    const body = parseInput(answerBodySchema, request.body);
    const lesson = findLesson(slug);

    if ('questionId' in body) {
      const q = db
        .select()
        .from(questions)
        .where(and(eq(questions.id, body.questionId), eq(questions.lessonId, lesson.id)))
        .get();
      if (!q) throw notFound(`Question ${body.questionId}`);
      if (body.value >= q.options.length) {
        throw new HttpError(
          400,
          'bad_request',
          `value must be an option index below ${q.options.length}`,
        );
      }
      const correct = body.value === q.correctIdx;
      db.insert(answers)
        .values({ userId: user.id, questionId: q.id, value: String(body.value), correct })
        .run();
      return {
        correct,
        feedback: (correct ? q.feedbackOk : q.feedbackWrong) ?? null,
        expected: null,
      };
    }

    const d = db
      .select()
      .from(dictationItems)
      .where(
        and(eq(dictationItems.id, body.dictationItemId), eq(dictationItems.lessonId, lesson.id)),
      )
      .get();
    if (!d) throw notFound(`Dictation item ${body.dictationItemId}`);
    const correct = normalizeDictation(body.value) === normalizeDictation(d.answer);
    db.insert(answers)
      .values({ userId: user.id, dictationItemId: d.id, value: body.value, correct })
      .run();
    return { correct, feedback: null, expected: correct ? null : d.answer };
  });

  app.post(`${API_PREFIX}/lessons/:slug/progress`, async (request): Promise<ProgressResponse> => {
    const user = requireUser(request);
    const { slug } = parseInput(lessonSlugParamsSchema, request.params);
    const body = parseInput(progressBodySchema, request.body);
    const lesson = findLesson(slug);
    const t = now();

    const row = db.transaction((tx) => {
      const prev = tx
        .select()
        .from(lessonProgress)
        .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lesson.id)))
        .get();
      // A completed lesson stays completed; the step never goes backwards.
      const wasCompleted = prev?.status === 'completed';
      const status = wasCompleted ? 'completed' : (body.status ?? 'in_progress');
      const values = {
        status,
        step: Math.max(prev?.step ?? 0, body.step),
        score: body.score === undefined ? (prev?.score ?? null) : body.score,
        completedAt: status === 'completed' ? (prev?.completedAt ?? t) : null,
        updatedAt: t,
      };
      const saved = tx
        .insert(lessonProgress)
        .values({ userId: user.id, lessonId: lesson.id, ...values })
        .onConflictDoUpdate({
          target: [lessonProgress.userId, lessonProgress.lessonId],
          set: values,
        })
        .returning()
        .get();
      // Counted once: only the transition to completed adds to today's lessons_done.
      if (status === 'completed' && !wasCompleted) {
        recordActivity(tx, user.id, t, { lessons: 1 });
      }
      return saved;
    });
    return { progress: toProgress(row)! };
  });
}

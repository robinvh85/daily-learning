/**
 * Saved words and the word book (plan section 5). Saving a word creates a new FSRS card
 * (state New, due now), so it shows up in the review queue right away (services/srs.ts).
 */
import { API_PREFIX } from '@daily-learning/shared';
import {
  saveWordBodySchema,
  savedWordsQuerySchema,
  vocabListQuerySchema,
  vocabWordParamsSchema,
  type SavedWordResponse,
  type SavedWordsResponse,
  type VocabListResponse,
  type VocabStatsResponse,
} from '@daily-learning/shared/api';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import {
  lessons,
  lessonTokens,
  lessonWords,
  userWords,
  words,
  wordSenses,
} from '../../db/schema.js';
import { HttpError, notFound, parseInput } from '../../http.js';
import { newCardColumns, systemClock, vocabStatus, type Clock } from '../../services/srs.js';
import { requireUser } from '../auth/routes.js';
import { savedWordRows, sourceLessonOf, statusCondition, vocabStats } from './queries.js';

export function vocabRoutes(app: FastifyInstance, db: AppDatabase, now: Clock = systemClock): void {
  app.post(`${API_PREFIX}/vocab/:wordId`, async (request, reply): Promise<SavedWordResponse> => {
    const user = requireUser(request);
    const { wordId } = parseInput(vocabWordParamsSchema, request.params);
    const body = parseInput(saveWordBodySchema, request.body);

    const word = db.select({ id: words.id }).from(words).where(eq(words.id, wordId)).get();
    if (!word) throw notFound(`Word ${wordId}`);
    const senseId = body.senseId ?? null;
    if (senseId !== null) {
      const sense = db
        .select({ id: wordSenses.id })
        .from(wordSenses)
        .where(and(eq(wordSenses.id, senseId), eq(wordSenses.wordId, wordId)))
        .get();
      if (!sense)
        throw new HttpError(
          400,
          'bad_request',
          `Sense ${senseId} does not belong to word ${wordId}`,
        );
    }
    const sourceLessonId = body.sourceLessonId ?? null;
    if (sourceLessonId !== null) {
      const l = db
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.id, sourceLessonId))
        .get();
      if (!l) throw notFound(`Lesson ${sourceLessonId}`);
    }

    // A new FSRS card, due now. Saving twice keeps the existing card (and its review history).
    const t = now();
    const inserted = db
      .insert(userWords)
      .values({
        userId: user.id,
        wordId,
        senseId,
        sourceLessonId,
        ...newCardColumns(t),
        createdAt: t,
      })
      .onConflictDoNothing()
      .returning({ wordId: userWords.wordId })
      .all();
    const row = db
      .select({ wordId: userWords.wordId, senseId: userWords.senseId })
      .from(userWords)
      .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)))
      .get()!;
    reply.code(inserted.length > 0 ? 201 : 200);
    return { wordId: row.wordId, senseId: row.senseId, saved: true };
  });

  app.delete(`${API_PREFIX}/vocab/:wordId`, async (request): Promise<SavedWordResponse> => {
    const user = requireUser(request);
    const { wordId } = parseInput(vocabWordParamsSchema, request.params);
    db.delete(userWords)
      .where(and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId)))
      .run();
    return { wordId, senseId: null, saved: false };
  });

  app.get(`${API_PREFIX}/vocab/saved`, async (request): Promise<SavedWordsResponse> => {
    const user = requireUser(request);
    const q = parseInput(savedWordsQuerySchema, request.query);
    const conds = [eq(userWords.userId, user.id)];
    if (q.lesson) {
      const lesson = db
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.slug, q.lesson))
        .get();
      if (!lesson) throw notFound(`Lesson "${q.lesson}"`);
      // Words that appear in the lesson text or in its focus list.
      const inLesson = new Set(
        [
          ...db
            .selectDistinct({ wordId: lessonTokens.wordId })
            .from(lessonTokens)
            .where(eq(lessonTokens.lessonId, lesson.id))
            .all(),
          ...db
            .select({ wordId: lessonWords.wordId })
            .from(lessonWords)
            .where(eq(lessonWords.lessonId, lesson.id))
            .all(),
        ].map((r) => r.wordId),
      );
      conds.push(inArray(userWords.wordId, [...inLesson]));
    }
    const rows = db
      .select({ wordId: userWords.wordId })
      .from(userWords)
      .where(and(...conds))
      .orderBy(asc(userWords.wordId))
      .all();
    return { wordIds: rows.map((r) => r.wordId) };
  });

  /**
   * Word book. `source` is the kind of the lesson the word was saved from (words saved without a
   * lesson only appear under `all`). Status mapping: see `vocabStatus()` in services/srs.ts.
   */
  app.get(`${API_PREFIX}/vocab`, async (request): Promise<VocabListResponse> => {
    const user = requireUser(request);
    const q = parseInput(vocabListQuerySchema, request.query);
    const conds: SQL[] = [eq(userWords.userId, user.id)];
    if (q.source !== 'all')
      conds.push(eq(lessons.kind, q.source === 'read' ? 'reading' : 'listening'));
    if (q.status !== 'all') conds.push(statusCondition(q.status));
    const rows = savedWordRows(db, and(...conds), {
      orderBy: [desc(userWords.createdAt), asc(words.lemma)],
    });
    return {
      items: rows.map((r) => ({
        wordId: r.wordId,
        lemma: r.lemma,
        meaningVi: r.meaningVi ?? '',
        status: vocabStatus(r.card.state, r.card.stability),
        sourceLesson: sourceLessonOf(r),
        due: r.card.due.toISOString(),
        savedAt: r.createdAt.toISOString(),
      })),
    };
  });

  /** Totals per status and the due count (Sidebar badge, Home). */
  app.get(`${API_PREFIX}/vocab/stats`, async (request): Promise<VocabStatsResponse> => {
    const user = requireUser(request);
    return vocabStats(db, user.id, now());
  });
}

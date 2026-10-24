/**
 * Review queue and ratings (plan section 5, Phase 4). Scheduling is FSRS (services/srs.ts).
 */
import { API_PREFIX } from '@daily-learning/shared';
import {
  dueReviewsQuerySchema,
  reviewBodySchema,
  vocabWordParamsSchema,
  type DueReviewsResponse,
  type ReviewResponse,
} from '@daily-learning/shared/api';
import { and, asc, eq, gt, lte, min, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import { dailyActivity, reviewLogs, userWords } from '../../db/schema.js';
import { notFound, parseInput } from '../../http.js';
import {
  localDate,
  previewRatings,
  review,
  systemClock,
  vocabStatus,
  type Clock,
} from '../../services/srs.js';
import { requireUser } from '../auth/routes.js';
import { contentUrl } from '../lessons/routes.js';
import { reviewCounts, savedWordRows, sourceLessonOf } from '../vocab/queries.js';

export function reviewRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  now: Clock = systemClock,
): void {
  /** Cards due now (due ≤ now), oldest first, with a preview of the 4 ratings. */
  app.get(`${API_PREFIX}/reviews/due`, async (request): Promise<DueReviewsResponse> => {
    const user = requireUser(request);
    const q = parseInput(dueReviewsQuerySchema, request.query);
    const t = now();
    const rows = savedWordRows(db, and(eq(userWords.userId, user.id), lte(userWords.due, t)), {
      orderBy: [asc(userWords.due), asc(userWords.wordId)],
      limit: q.limit,
    });
    const next = db
      .select({ due: min(userWords.due) })
      .from(userWords)
      .where(and(eq(userWords.userId, user.id), gt(userWords.due, t)))
      .get();
    return {
      cards: rows.map((r) => ({
        wordId: r.wordId,
        lemma: r.lemma,
        ipaUs: r.ipaUs,
        pos: r.pos ?? '',
        meaningVi: r.meaningVi ?? '',
        example: r.example ?? '',
        sourceLesson: sourceLessonOf(r),
        audioUrl: contentUrl(r.audioPath, r.audioVersion),
        status: vocabStatus(r.card.state, r.card.stability),
        due: r.card.due.toISOString(),
        previews: previewRatings(r.card, t).map((p) => ({
          rating: p.rating,
          due: p.due.toISOString(),
          interval: p.interval,
        })),
      })),
      counts: reviewCounts(db, user.id, t),
      nextDueAt: next?.due ? next.due.toISOString() : null,
    };
  });

  /** Rate a saved word: FSRS computes the next schedule; every review is logged. */
  app.post(`${API_PREFIX}/reviews/:wordId`, async (request): Promise<ReviewResponse> => {
    const user = requireUser(request);
    const { wordId } = parseInput(vocabWordParamsSchema, request.params);
    const { rating } = parseInput(reviewBodySchema, request.body);
    const t = now();
    const where = and(eq(userWords.userId, user.id), eq(userWords.wordId, wordId));

    const card = db.transaction((tx) => {
      const row = tx
        .select({
          due: userWords.due,
          stability: userWords.stability,
          difficulty: userWords.difficulty,
          scheduledDays: userWords.scheduledDays,
          learningSteps: userWords.learningSteps,
          reps: userWords.reps,
          lapses: userWords.lapses,
          state: userWords.state,
          lastReview: userWords.lastReview,
        })
        .from(userWords)
        .where(where)
        .get();
      if (!row) throw notFound(`Saved word ${wordId}`);
      const result = review(row, rating, t);
      tx.update(userWords).set(result.card).where(where).run();
      tx.insert(reviewLogs)
        .values({ userId: user.id, wordId, ...result.log })
        .run();
      tx.insert(dailyActivity)
        .values({ userId: user.id, date: localDate(t), reviewsDone: 1 })
        .onConflictDoUpdate({
          target: [dailyActivity.userId, dailyActivity.date],
          set: { reviewsDone: sql`${dailyActivity.reviewsDone} + 1` },
        })
        .run();
      return result.card;
    });

    return {
      wordId,
      rating,
      card: {
        due: card.due.toISOString(),
        state: card.state,
        status: vocabStatus(card.state, card.stability),
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        scheduledDays: card.scheduledDays,
        lastReview: card.lastReview?.toISOString() ?? null,
      },
      counts: reviewCounts(db, user.id, t),
    };
  });
}

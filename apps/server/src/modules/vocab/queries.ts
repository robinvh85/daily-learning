/** Queries over saved words (`user_words`) shared by the vocab and review routes. */
import { KNOWN_STABILITY_DAYS, type VocabStatus } from '@daily-learning/shared';
import type {
  ReviewCountsDto,
  SourceLessonDto,
  VocabStatsResponse,
} from '@daily-learning/shared/api';
import { and, asc, count, desc, eq, gte, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client.js';
import {
  lessons,
  lessonTokens,
  reviewLogs,
  segments,
  userWords,
  words,
  wordSenses,
} from '../../db/schema.js';
import { startOfLocalDay } from '../../services/srs.js';

/** SQL form of `vocabStatus()` in services/srs.ts (keep both in sync). */
export function statusCondition(status: VocabStatus): SQL {
  switch (status) {
    case 'new':
      return sql`${userWords.state} = 0`;
    case 'learning':
      return sql`(${userWords.state} in (1, 3) or (${userWords.state} = 2 and ${userWords.stability} < ${KNOWN_STABILITY_DAYS}))`;
    case 'known':
      return sql`(${userWords.state} = 2 and ${userWords.stability} >= ${KNOWN_STABILITY_DAYS})`;
  }
}

/** The saved sense, or the first sense of the word when none was saved. */
const senseJoin = sql`${wordSenses.id} = coalesce(${userWords.senseId}, (select ws.id from ${wordSenses} ws where ws.word_id = ${userWords.wordId} order by ws.idx limit 1))`;

/** Saved words joined with the word, its sense and the source lesson. */
export function savedWordRows(
  db: AppDatabase,
  where: SQL | undefined,
  opts: { orderBy: SQL[]; limit?: number },
) {
  const q = db
    .select({
      card: {
        due: userWords.due,
        stability: userWords.stability,
        difficulty: userWords.difficulty,
        scheduledDays: userWords.scheduledDays,
        learningSteps: userWords.learningSteps,
        reps: userWords.reps,
        lapses: userWords.lapses,
        state: userWords.state,
        lastReview: userWords.lastReview,
      },
      wordId: userWords.wordId,
      createdAt: userWords.createdAt,
      lemma: words.lemma,
      ipaUs: words.ipaUs,
      audioPath: words.audioPath,
      audioVersion: words.audioVersion,
      senseId: wordSenses.id,
      pos: wordSenses.pos,
      meaningVi: wordSenses.meaningVi,
      example: wordSenses.example,
      lessonId: lessons.id,
      lessonSlug: lessons.slug,
      lessonKind: lessons.kind,
      lessonTitle: lessons.title,
    })
    .from(userWords)
    .innerJoin(words, eq(words.id, userWords.wordId))
    .leftJoin(wordSenses, senseJoin)
    .leftJoin(lessons, eq(lessons.id, userWords.sourceLessonId))
    .where(where)
    .orderBy(...opts.orderBy)
    .$dynamic();
  return (opts.limit === undefined ? q : q.limit(opts.limit)).all();
}
export type SavedWordRow = ReturnType<typeof savedWordRows>[number];

export function sourceLessonOf(r: SavedWordRow): SourceLessonDto | null {
  if (r.lessonId === null || !r.lessonSlug || !r.lessonKind || !r.lessonTitle) return null;
  return { id: r.lessonId, slug: r.lessonSlug, kind: r.lessonKind, title: r.lessonTitle };
}

/**
 * A lesson sentence containing the word, with its slice of the lesson audio: the source lesson
 * first, then the saved sense, then lesson order. Only lessons with audio and timings count.
 */
export function exampleSentence(
  db: AppDatabase,
  wordId: number,
  senseId: number | null,
  sourceLessonId: number | null,
) {
  return (
    db
      .select({
        textEn: segments.textEn,
        startMs: segments.startMs,
        endMs: segments.endMs,
        audioPath: lessons.audioPath,
        audioVersion: lessons.audioVersion,
      })
      .from(lessonTokens)
      .innerJoin(segments, eq(segments.id, lessonTokens.segmentId))
      .innerJoin(lessons, eq(lessons.id, lessonTokens.lessonId))
      .where(
        and(
          eq(lessonTokens.wordId, wordId),
          isNotNull(lessons.audioPath),
          isNotNull(segments.startMs),
          isNotNull(segments.endMs),
        ),
      )
      .orderBy(
        desc(sql`${lessons.id} is ${sourceLessonId}`),
        desc(sql`${lessonTokens.senseId} is ${senseId}`),
        asc(lessons.orderIndex),
        asc(lessons.id),
        asc(segments.idx),
      )
      .limit(1)
      .get() ?? null
  );
}

export function countDue(db: AppDatabase, userId: number, now: Date): number {
  return db
    .select({ n: count() })
    .from(userWords)
    .where(and(eq(userWords.userId, userId), lte(userWords.due, now)))
    .get()!.n;
}

/** Reviews logged since the start of the local day (Asia/Ho_Chi_Minh). */
export function countDoneToday(db: AppDatabase, userId: number, now: Date): number {
  return db
    .select({ n: count() })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, startOfLocalDay(now))))
    .get()!.n;
}

export function reviewCounts(db: AppDatabase, userId: number, now: Date): ReviewCountsDto {
  return { due: countDue(db, userId, now), doneToday: countDoneToday(db, userId, now) };
}

export function vocabStats(db: AppDatabase, userId: number, now: Date): VocabStatsResponse {
  const n = (status: VocabStatus) =>
    db
      .select({ n: count() })
      .from(userWords)
      .where(and(eq(userWords.userId, userId), statusCondition(status)))
      .get()!.n;
  const stats = { new: n('new'), learning: n('learning'), known: n('known') };
  return {
    total: stats.new + stats.learning + stats.known,
    ...stats,
    due: countDue(db, userId, now),
  };
}

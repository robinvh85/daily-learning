/**
 * Spaced repetition with FSRS (`ts-fsrs`, plan 2.1), using the library's default parameters
 * (request retention 0.9, learning steps 1m/10m, relearning step 10m, no fuzz).
 *
 * Pure functions only: the caller passes "now", so tests control time. Database rows
 * (`user_words`) are converted to and from the ts-fsrs `Card` here.
 */
import {
  KNOWN_STABILITY_DAYS,
  formatIntervalVi,
  type ReviewRating,
  type VocabStatus,
} from '@daily-learning/shared';
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';

/** Source of "now". Injected into the app so tests can move time. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

const DAY_MS = 24 * 60 * 60 * 1000;

/** FSRS scheduler with default parameters. */
export const scheduler = fsrs();

/** UI rating → FSRS grade: Quên = Again, Khó = Hard, Nhớ = Good, Dễ = Easy. */
export const UI_RATING_TO_FSRS: Record<ReviewRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

/** FSRS columns of `user_words`. */
export interface CardColumns {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
}

/** A fresh FSRS card (state New, due now): what saving a word stores. */
export function newCardColumns(now: Date): CardColumns {
  return cardToColumns(createEmptyCard(now));
}

export function rowToCard(row: CardColumns, now: Date): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    // Deprecated in ts-fsrs 5 (computed from last_review); kept for the type.
    elapsed_days: row.lastReview
      ? Math.max(0, (now.getTime() - row.lastReview.getTime()) / DAY_MS)
      : 0,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview ?? undefined,
  };
}

export function cardToColumns(card: Card): CardColumns {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  };
}

export interface ReviewResult {
  card: CardColumns;
  /** Row for `review_logs` (without user and word ids). */
  log: {
    rating: ReviewRating;
    reviewedAt: Date;
    elapsedDays: number;
    /** State before the review. */
    state: number;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    due: Date;
  };
}

/** Apply a rating at `now`. */
export function review(row: CardColumns, rating: ReviewRating, now: Date): ReviewResult {
  const { card } = scheduler.next(rowToCard(row, now), now, UI_RATING_TO_FSRS[rating]);
  const elapsedDays = row.lastReview
    ? Math.max(0, (now.getTime() - row.lastReview.getTime()) / DAY_MS)
    : 0;
  return {
    card: cardToColumns(card),
    log: {
      rating,
      reviewedAt: now,
      elapsedDays: Math.round(elapsedDays * 1000) / 1000,
      state: row.state,
      stability: card.stability,
      difficulty: card.difficulty,
      scheduledDays: card.scheduled_days,
      due: card.due,
    },
  };
}

export interface RatingPreview {
  rating: ReviewRating;
  due: Date;
  /** "10 phút", "1 ngày", "2 tuần" */
  interval: string;
}

/** What each of the 4 ratings would do, via FSRS `repeat()`. */
export function previewRatings(row: CardColumns, now: Date): RatingPreview[] {
  const preview = scheduler.repeat(rowToCard(row, now), now);
  return ([1, 2, 3, 4] as const).map((rating) => {
    const due = preview[UI_RATING_TO_FSRS[rating]].card.due;
    return { rating, due, interval: formatIntervalVi(due.getTime() - now.getTime()) };
  });
}

/**
 * Word-book status (plan 2.1): New → `new`; Learning/Relearning, or Review with
 * stability < 21 days → `learning`; Review with stability ≥ 21 days → `known`.
 */
export function vocabStatus(state: number, stability: number): VocabStatus {
  if (state === State.New) return 'new';
  if (state === State.Review && stability >= KNOWN_STABILITY_DAYS) return 'known';
  return 'learning';
}

/** Offset of Asia/Ho_Chi_Minh (UTC+7 all year, no DST). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Start of the local day (Asia/Ho_Chi_Minh) containing `now`. */
export function startOfLocalDay(now: Date): Date {
  const local = now.getTime() + VN_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - VN_OFFSET_MS);
}

/** Local date `YYYY-MM-DD` (Asia/Ho_Chi_Minh), for `daily_activity.date`. */
export function localDate(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

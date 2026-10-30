/**
 * Spaced repetition with FSRS (`ts-fsrs`, plan 2.1), tuned for A2–B1 learners (see `scheduler`).
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
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';

/** Source of "now". Injected into the app so tests can move time. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FSRS scheduler. The library defaults (retention 0.9, steps 1m/10m, no cap) suit long-time Anki
 * users: Quên came back after 1 minute, Khó/Nhớ were 6/10 minutes apart, and a few Nhớ answers
 * pushed a word years away. For new learners:
 * - one 10-minute (re)learning step: Quên comes back later in the session, Nhớ on a new word
 *   means tomorrow;
 * - retention 0.95: words come back sooner (new word on Nhớ: 1 → 3 → … → ~3 months);
 * - at most 180 days between reviews (at the cap Nhớ/Dễ get 181/182 days, so the buttons stay
 *   in order); no fuzz (tests and previews stay exact).
 */
export const scheduler = fsrs(
  generatorParameters({
    learning_steps: ['10m'],
    relearning_steps: ['10m'],
    request_retention: 0.95,
    maximum_interval: 180,
    enable_fuzz: false,
  }),
);

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

/**
 * The next card for each rating. On a weak card (just forgotten, or a new word answered Quên/Khó)
 * FSRS rounds Nhớ and Dễ to the same 1-day minimum; like Anki, Dễ is then pushed one day past
 * Nhớ, so the two buttons never do the same thing.
 */
function schedule(row: CardColumns, now: Date): Record<ReviewRating, Card> {
  const log = scheduler.repeat(rowToCard(row, now), now);
  const next = (rating: ReviewRating) => log[UI_RATING_TO_FSRS[rating]].card;
  const good = next(3);
  let easy = next(4);
  if (good.state === State.Review && easy.scheduled_days <= good.scheduled_days) {
    const days = good.scheduled_days + 1;
    easy = { ...easy, scheduled_days: days, due: new Date(now.getTime() + days * DAY_MS) };
  }
  return { 1: next(1), 2: next(2), 3: good, 4: easy };
}

/** Apply a rating at `now`. */
export function review(row: CardColumns, rating: ReviewRating, now: Date): ReviewResult {
  const card = schedule(row, now)[rating];
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

/** What each of the 4 ratings would do (the same schedule `review()` applies). */
export function previewRatings(row: CardColumns, now: Date): RatingPreview[] {
  const cards = schedule(row, now);
  return ([1, 2, 3, 4] as const).map((rating) => {
    const due = cards[rating].due;
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

/** Start of the next local day: when a postponed ("Mai ôn") card comes back. */
export function startOfNextLocalDay(now: Date): Date {
  return new Date(startOfLocalDay(now).getTime() + DAY_MS);
}

/** Local date `YYYY-MM-DD` (Asia/Ho_Chi_Minh), for `daily_activity.date`. */
export function localDate(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

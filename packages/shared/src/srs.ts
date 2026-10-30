/**
 * Spaced repetition constants shared by server and web (plan 2.1: FSRS via `ts-fsrs`).
 */

/** The 4 answer buttons. Values equal the FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const REVIEW_RATINGS = [1, 2, 3, 4] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

/** Vietnamese button labels: Quên = Again, Khó = Hard, Nhớ = Good, Dễ = Easy. */
export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  1: 'Quên',
  2: 'Khó',
  3: 'Nhớ',
  4: 'Dễ',
};

/** "Mai ôn": postpone the card to tomorrow without rating it (shown between Khó and Nhớ). */
export const POSTPONE_LABEL = 'Mai ôn';

/**
 * Word-book status derived from the FSRS card:
 * - `new`: FSRS state New (saved, never reviewed)
 * - `learning`: Learning / Relearning, or Review with stability < KNOWN_STABILITY_DAYS
 * - `known`: Review with stability ≥ KNOWN_STABILITY_DAYS
 */
export const VOCAB_STATUSES = ['new', 'learning', 'known'] as const;
export type VocabStatus = (typeof VOCAB_STATUSES)[number];

/** Stability (days) from which a Review card counts as "Đã thuộc". */
export const KNOWN_STABILITY_DAYS = 21;

export const VOCAB_STATUS_LABELS: Record<VocabStatus, string> = {
  new: 'Mới',
  learning: 'Đang ôn',
  known: 'Đã thuộc',
};

/** Source of a saved word: the kind of the lesson it was saved from. */
export const VOCAB_SOURCES = ['read', 'listen'] as const;
export type VocabSource = (typeof VOCAB_SOURCES)[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One decimal at most, Vietnamese decimal comma ("1,5"). */
function num(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/**
 * A duration in Vietnamese, as shown under the rating buttons:
 * "1 phút", "10 phút", "3 giờ", "1 ngày", "12 ngày", "2 tuần", "3 tháng", "1,5 năm".
 */
export function formatIntervalVi(ms: number): string {
  const d = Math.max(0, ms);
  if (d < HOUR) return `${Math.max(1, Math.round(d / MINUTE))} phút`;
  if (d < DAY) return `${Math.round(d / HOUR)} giờ`;
  const days = Math.round(d / DAY);
  if (days < 14) return `${days} ngày`;
  if (days < 60) return `${Math.round(days / 7)} tuần`;
  if (days < 365) return `${Math.round(days / 30)} tháng`;
  return `${num(days / 365)} năm`;
}

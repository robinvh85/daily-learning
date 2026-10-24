/** Time estimates shown on Home and in the library. */

/** Reading speed assumed for A2 learners (words per minute). */
export const READING_WPM = 120;

/** Minutes to read a text of `wordCount` words at `READING_WPM` (at least 1). */
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / READING_WPM));
}

/** Default daily study goal in minutes (`users.daily_goal_min`). */
export const DEFAULT_DAILY_GOAL_MIN = 15;

/** Asia/Ho_Chi_Minh is UTC+7 all year (no DST). */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

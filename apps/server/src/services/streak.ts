/**
 * Streak and week statistics from `daily_activity` (pure functions; "today" is passed in).
 */
import { addDays, weekDates } from './calendar.js';

export interface ActivityDay {
  /** `YYYY-MM-DD` (Asia/Ho_Chi_Minh). */
  date: string;
  secondsStudied: number;
  lessonsDone: number;
  reviewsDone: number;
}

/** A day counts for the streak with ≥ 1 minute of study, a finished lesson or a review. */
export function isActiveDay(d: ActivityDay): boolean {
  return d.secondsStudied >= 60 || d.lessonsDone > 0 || d.reviewsDone > 0;
}

/**
 * Consecutive active days ending today, or ending yesterday when today has no activity yet
 * (the streak is not lost until the day is over).
 */
export function computeStreak(
  days: readonly ActivityDay[],
  today: string,
): { days: number; activeToday: boolean } {
  const active = new Set(days.filter(isActiveDay).map((d) => d.date));
  const activeToday = active.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let n = 0;
  while (active.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return { days: n, activeToday };
}

/** Minutes studied on each day of the week (Monday → Sunday) containing `today`. */
export function weekMinutes(
  days: readonly ActivityDay[],
  today: string,
): { date: string; minutes: number; seconds: number }[] {
  const byDate = new Map(days.map((d) => [d.date, d.secondsStudied]));
  return weekDates(today).map((date) => {
    const seconds = byDate.get(date) ?? 0;
    return { date, seconds, minutes: Math.round(seconds / 60) };
  });
}

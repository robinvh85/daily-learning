/**
 * Daily activity (`daily_activity`, plan section 4): study time, lessons done and reviews per
 * local day (Asia/Ho_Chi_Minh, see `localDate()` in srs.ts). Feeds the streak and the week chart.
 */
import { HEARTBEAT_MAX_SECONDS } from '@daily-learning/shared/api';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { dailyActivity } from '../db/schema.js';
import { localDate } from './srs.js';

/** The database or a transaction: anything that can insert. */
export type ActivityWriter = Pick<AppDatabase, 'insert'>;

export interface ActivityDelta {
  seconds?: number;
  lessons?: number;
  reviews?: number;
}

/** Add to the user's row for the local day of `now` (created when missing). */
export function recordActivity(
  db: ActivityWriter,
  userId: number,
  now: Date,
  delta: ActivityDelta,
): void {
  const seconds = delta.seconds ?? 0;
  const lessons = delta.lessons ?? 0;
  const reviews = delta.reviews ?? 0;
  db.insert(dailyActivity)
    .values({
      userId,
      date: localDate(now),
      secondsStudied: seconds,
      lessonsDone: lessons,
      reviewsDone: reviews,
    })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.date],
      set: {
        secondsStudied: sql`${dailyActivity.secondsStudied} + ${seconds}`,
        lessonsDone: sql`${dailyActivity.lessonsDone} + ${lessons}`,
        reviewsDone: sql`${dailyActivity.reviewsDone} + ${reviews}`,
      },
    })
    .run();
}

/** Heartbeat seconds: rounded and clamped to 0..60 (NaN/negative → 0). */
export function clampHeartbeatSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(HEARTBEAT_MAX_SECONDS, Math.round(seconds));
}

/** Home statistics (`GET /api/dashboard`): streak, path progress, words, this week. */
import { DEFAULT_DAILY_GOAL_MIN } from '@daily-learning/shared';
import type { DashboardResponse } from '@daily-learning/shared/api';
import { and, count, eq, inArray, lte } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { dailyActivity, lessonProgress, lessons, users, userWords, words } from '../db/schema.js';
import { vocabStats } from '../modules/vocab/queries.js';
import { localDate } from './srs.js';
import { computeStreak, weekMinutes } from './streak.js';

export function buildDashboard(db: AppDatabase, userId: number, now: Date): DashboardResponse {
  const today = localDate(now);
  const user = db
    .select({ displayName: users.displayName, level: users.level, goal: users.dailyGoalMin })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const level = user?.level ?? 'A2';

  const activity = db
    .select({
      date: dailyActivity.date,
      secondsStudied: dailyActivity.secondsStudied,
      lessonsDone: dailyActivity.lessonsDone,
      reviewsDone: dailyActivity.reviewsDone,
    })
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, userId), lte(dailyActivity.date, today)))
    .all();
  const week = weekMinutes(activity, today);

  // Path A2 → B1: completed lessons of the user's current level / all lessons of that level.
  const total = db.select({ n: count() }).from(lessons).where(eq(lessons.level, level)).get()!.n;
  const completed = db
    .select({ n: count() })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, 'completed'),
        eq(lessons.level, level),
      ),
    )
    .get()!.n;

  // Remembered = learning + known (FSRS state Learning, Review or Relearning).
  const stats = vocabStats(db, userId, now);
  const oxford = db
    .select({ n: count() })
    .from(userWords)
    .innerJoin(words, eq(words.id, userWords.wordId))
    .where(
      and(
        eq(userWords.userId, userId),
        inArray(userWords.state, [1, 2, 3]),
        eq(words.oxford3000, true),
      ),
    )
    .get()!.n;

  return {
    displayName: user?.displayName ?? 'bạn',
    level,
    date: today,
    streak: computeStreak(activity, today),
    path: {
      level,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    words: {
      remembered: stats.known + stats.learning,
      known: stats.known,
      learning: stats.learning,
      oxford3000: oxford,
    },
    week: {
      totalMinutes: Math.round(week.reduce((n, d) => n + d.seconds, 0) / 60),
      dailyGoalMin: user?.goal ?? DEFAULT_DAILY_GOAL_MIN,
      days: week.map(({ date, minutes }) => ({ date, minutes })),
    },
  };
}

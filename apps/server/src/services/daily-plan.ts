/**
 * "Bài học hôm nay" (plan Phase 5).
 *
 * Day N of the learning path is the first day of `daily_plans_template` whose reading or
 * listening lesson is not completed. It is progress-based, not calendar-based, so skipping a
 * calendar day never skips a lesson.
 *
 * Stay rule: when the day before N was finished today (its last lesson was completed today,
 * Asia/Ho_Chi_Minh), today's plan stays on that day and shows as done; day N starts tomorrow.
 * The same applies to the last day of the plan.
 *
 * When every plan day is done, the plan falls back to the next uncompleted reading and listening
 * lessons by level/order (no stay rule there), and finally to "Đã học hết bài hiện có".
 */
import { LESSON_LEVELS, readingMinutes, type LessonLevel } from '@daily-learning/shared';
import type {
  LessonSummary,
  TodayResponse,
  TodayStepDto,
  TodayStepStatus,
} from '@daily-learning/shared/api';
import { and, asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { dailyPlansTemplate, lessonProgress, lessons } from '../db/schema.js';
import { lessonHref, toSummary } from '../modules/lessons/routes.js';
import { reviewCounts } from '../modules/vocab/queries.js';
import { localDate } from './srs.js';

export interface PlanDay {
  day: number;
  title: string | null;
  readingLessonId: number | null;
  listeningLessonId: number | null;
}

/** A lesson with the user's progress. */
export interface LessonState {
  id: number;
  kind: 'reading' | 'listening';
  level: LessonLevel;
  orderIndex: number;
  title: string;
  completed: boolean;
  completedAt: Date | null;
}

export type TodayPick =
  | {
      source: 'plan';
      day: number;
      title: string | null;
      readingId: number | null;
      listeningId: number | null;
    }
  | { source: 'fallback'; day: number; readingId: number | null; listeningId: number | null }
  | { source: 'finished' };

/** Choose today's lessons. Pure: `today` is the local date `YYYY-MM-DD`. */
export function pickToday(
  planDays: readonly PlanDay[],
  lessonStates: readonly LessonState[],
  today: string,
): TodayPick {
  const byId = new Map(lessonStates.map((l) => [l.id, l]));
  // A missing lesson (removed from content/) cannot be studied, so it counts as done.
  const isDone = (id: number | null) => id === null || (byId.get(id)?.completed ?? true);
  const ids = (d: PlanDay) => [d.readingLessonId, d.listeningLessonId];
  const dayDone = (d: PlanDay) => ids(d).every(isDone);
  /** Local date the day was finished on (its latest completion), or null. */
  const finishedOn = (d: PlanDay): string | null => {
    if (!dayDone(d)) return null;
    const times = ids(d)
      .map((id) => (id === null ? null : (byId.get(id)?.completedAt ?? null)))
      .filter((t): t is Date => t !== null)
      .map((t) => t.getTime());
    return times.length ? localDate(new Date(Math.max(...times))) : null;
  };
  const asPlan = (d: PlanDay): TodayPick => ({
    source: 'plan',
    day: d.day,
    title: d.title,
    readingId: d.readingLessonId,
    listeningId: d.listeningLessonId,
  });

  const days = [...planDays].sort((a, b) => a.day - b.day);
  const next = days.findIndex((d) => !dayDone(d));
  const prev = days[next === -1 ? days.length - 1 : next - 1];
  if (prev && finishedOn(prev) === today) return asPlan(prev);
  if (next !== -1) return asPlan(days[next]!);

  // The plan ran out: next uncompleted lessons in library order.
  const levelIdx = (l: LessonState) => LESSON_LEVELS.indexOf(l.level);
  const queue = lessonStates
    .filter((l) => !l.completed)
    .sort(
      (a, b) =>
        levelIdx(a) - levelIdx(b) || a.orderIndex - b.orderIndex || a.title.localeCompare(b.title),
    );
  const reading = queue.find((l) => l.kind === 'reading')?.id ?? null;
  const listening = queue.find((l) => l.kind === 'listening')?.id ?? null;
  if (reading === null && listening === null) return { source: 'finished' };
  return {
    source: 'fallback',
    day: (days[days.length - 1]?.day ?? 0) + 1,
    readingId: reading,
    listeningId: listening,
  };
}

// ---------------------------------------------------------------------------
// Estimates and step status
// ---------------------------------------------------------------------------

/** Steps inside the reading and listening pages (0, 1, 2); see ReadingPage/ListeningPage. */
const LESSON_STEPS = 3;
/** Minutes for focus words + questions (reading) or dictation + questions (listening). */
const EXERCISE_MINUTES = 3;
/** A2 dialogue speed used when a listening lesson has no audio yet. */
const SPEECH_WPM = 150;
/** Average time per flashcard. */
const SECONDS_PER_REVIEW = 12;

/** Reading: text at 120 wpm + exercises. Listening: audio played ~3 times + exercises. */
export function lessonMinutes(l: Pick<LessonSummary, 'kind' | 'wordCount' | 'durationMs'>) {
  if (l.kind === 'reading') return readingMinutes(l.wordCount) + EXERCISE_MINUTES;
  const audioMs = l.durationMs ?? (l.wordCount / SPEECH_WPM) * 60_000;
  return Math.max(1, Math.ceil((audioMs * 3) / 60_000)) + EXERCISE_MINUTES;
}

export function reviewMinutes(due: number): number {
  return due > 0 ? Math.max(1, Math.ceil((due * SECONDS_PER_REVIEW) / 60)) : 0;
}

function lessonStep(l: LessonSummary): TodayStepDto {
  const p = l.progress;
  let status: TodayStepStatus = 'not_started';
  let progressPct = 0;
  if (p?.status === 'completed') {
    status = 'done';
    progressPct = 100;
  } else if (p?.status === 'in_progress') {
    status = 'in_progress';
    progressPct = Math.max(10, Math.round((p.step / LESSON_STEPS) * 100));
  }
  return {
    kind: l.kind,
    status,
    progressPct,
    minutes: lessonMinutes(l),
    url: lessonHref(l),
    lesson: l,
    reviews: null,
  };
}

/** Reviews are done when nothing is due; partly done when some were reviewed today. */
export function reviewStep(counts: { due: number; doneToday: number }): TodayStepDto {
  const { due, doneToday } = counts;
  const status: TodayStepStatus =
    due === 0 ? 'done' : doneToday > 0 ? 'in_progress' : 'not_started';
  return {
    kind: 'reviews',
    status,
    progressPct: due === 0 ? 100 : Math.round((doneToday / (doneToday + due)) * 100),
    minutes: reviewMinutes(due),
    url: '/vocab',
    lesson: null,
    reviews: counts,
  };
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export function buildToday(db: AppDatabase, userId: number, now: Date): TodayResponse {
  const today = localDate(now);
  const rows = db
    .select({ lesson: lessons, progress: lessonProgress })
    .from(lessons)
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .all();
  const states: LessonState[] = rows.map(({ lesson: l, progress: p }) => ({
    id: l.id,
    kind: l.kind,
    level: l.level,
    orderIndex: l.orderIndex,
    title: l.title,
    completed: p?.status === 'completed',
    completedAt: p?.completedAt ?? null,
  }));
  const planDays = db.select().from(dailyPlansTemplate).orderBy(asc(dailyPlansTemplate.day)).all();
  const pick = pickToday(planDays, states, today);

  const summary = (id: number | null) => {
    const r = id === null ? undefined : rows.find((x) => x.lesson.id === id);
    return r ? toSummary(r.lesson, r.progress) : null;
  };
  const steps: TodayStepDto[] = [];
  if (pick.source !== 'finished') {
    for (const id of [pick.readingId, pick.listeningId]) {
      const l = summary(id);
      if (l) steps.push(lessonStep(l));
    }
  }
  steps.push(reviewStep(reviewCounts(db, userId, now)));

  const open = steps.filter((s) => s.status !== 'done');
  const title =
    pick.source === 'plan'
      ? (pick.title ?? `Ngày ${pick.day}`)
      : pick.source === 'fallback'
        ? 'Bài tiếp theo trong thư viện'
        : 'Đã học hết bài hiện có';
  return {
    date: today,
    source: pick.source,
    day: pick.source === 'finished' ? null : pick.day,
    title,
    steps,
    estimatedMinutes: open.reduce((n, s) => n + s.minutes, 0),
    continueUrl: open[0]?.url ?? null,
    allDone: open.length === 0,
  };
}

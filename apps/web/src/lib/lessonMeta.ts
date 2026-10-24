import { readingMinutes, type LessonProgressStatus } from '@daily-learning/shared';
import type { LessonSummary } from '@daily-learning/shared/api';
import { formatTime } from './time';

/** Reading: minutes at ~120 wpm. Listening: audio length, or "chưa có audio". */
export function lessonDuration(l: Pick<LessonSummary, 'kind' | 'wordCount' | 'durationMs'>) {
  if (l.kind === 'reading') return `${readingMinutes(l.wordCount)} phút`;
  return l.durationMs ? formatTime(l.durationMs) : 'chưa có audio';
}

export const LESSON_STATUS_VI: Record<LessonProgressStatus, string> = {
  not_started: 'Chưa học',
  in_progress: 'Đang học',
  completed: 'Đã xong',
};

export function lessonStatus(l: Pick<LessonSummary, 'progress'>): LessonProgressStatus {
  return l.progress?.status ?? 'not_started';
}

/** Home library cards: up to 3 lessons other than today's, unfinished first, library order. */
export function pickLibraryLessons(
  lessons: readonly LessonSummary[],
  excludeIds: ReadonlySet<number>,
): LessonSummary[] {
  const rest = lessons.filter((l) => !excludeIds.has(l.id));
  const open = rest.filter((l) => lessonStatus(l) !== 'completed');
  const done = rest.filter((l) => lessonStatus(l) === 'completed');
  return [...open, ...done].slice(0, 3);
}

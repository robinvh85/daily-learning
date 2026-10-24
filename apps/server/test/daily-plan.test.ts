import { describe, expect, it } from 'vitest';
import {
  lessonMinutes,
  pickToday,
  reviewStep,
  type LessonState,
  type PlanDay,
} from '../src/services/daily-plan.js';

const plan: PlanDay[] = [
  { day: 1, title: 'Ngày một', readingLessonId: 1, listeningLessonId: 2 },
  { day: 2, title: 'Ngày hai', readingLessonId: 3, listeningLessonId: 4 },
];

function lesson(
  id: number,
  kind: LessonState['kind'],
  completedAt: string | null = null,
  extra: Partial<LessonState> = {},
): LessonState {
  return {
    id,
    kind,
    level: 'A2',
    orderIndex: id,
    title: `L${id}`,
    completed: completedAt !== null,
    completedAt: completedAt ? new Date(completedAt) : null,
    ...extra,
  };
}

const TODAY = '2026-10-24';

describe('pickToday', () => {
  it('starts on day 1', () => {
    const states = [lesson(1, 'reading'), lesson(2, 'listening'), lesson(3, 'reading')];
    expect(pickToday(plan, states, TODAY)).toMatchObject({ source: 'plan', day: 1 });
  });

  it('stays on day 1 while only one lesson is done', () => {
    const states = [lesson(1, 'reading', '2026-10-24T03:00:00Z'), lesson(2, 'listening')];
    expect(pickToday(plan, states, TODAY)).toMatchObject({ day: 1, title: 'Ngày một' });
  });

  it('keeps a day finished today until tomorrow, then moves to day N+1', () => {
    const states = [
      lesson(1, 'reading', '2026-10-24T03:00:00Z'),
      // 23:30 in Vietnam on the 24th (16:30 UTC).
      lesson(2, 'listening', '2026-10-24T16:30:00Z'),
      lesson(3, 'reading'),
      lesson(4, 'listening'),
    ];
    expect(pickToday(plan, states, '2026-10-24')).toMatchObject({ source: 'plan', day: 1 });
    expect(pickToday(plan, states, '2026-10-25')).toMatchObject({ source: 'plan', day: 2 });
  });

  it('uses the Vietnam day: finished at 00:30 VN (17:30 UTC the day before) counts as today', () => {
    const states = [
      lesson(1, 'reading', '2026-10-23T10:00:00Z'),
      lesson(2, 'listening', '2026-10-23T17:30:00Z'),
      lesson(3, 'reading'),
      lesson(4, 'listening'),
    ];
    expect(pickToday(plan, states, '2026-10-24')).toMatchObject({ day: 1 });
    expect(pickToday(plan, states, '2026-10-23')).toMatchObject({ day: 2 });
  });

  it('is progress-based: skipped calendar days do not skip lessons', () => {
    const states = [
      lesson(1, 'reading', '2026-10-01T03:00:00Z'),
      lesson(2, 'listening', '2026-10-01T04:00:00Z'),
      lesson(3, 'reading'),
      lesson(4, 'listening'),
    ];
    expect(pickToday(plan, states, '2026-10-24')).toMatchObject({ day: 2, readingId: 3 });
  });

  it('treats lessons missing from the database as done', () => {
    const states = [lesson(3, 'reading'), lesson(4, 'listening')];
    expect(pickToday(plan, states, TODAY)).toMatchObject({ day: 2 });
  });

  it('falls back to the next uncompleted lessons by level and order, then finishes', () => {
    const done = '2026-10-20T03:00:00Z';
    const base = [1, 2, 3, 4].map((id) => lesson(id, id % 2 ? 'reading' : 'listening', done));
    const states = [
      ...base,
      lesson(9, 'reading', null, { level: 'B1', orderIndex: 0 }),
      lesson(8, 'reading', null, { level: 'A2+', orderIndex: 5 }),
      lesson(7, 'listening', null, { level: 'A2', orderIndex: 9 }),
    ];
    expect(pickToday(plan, states, TODAY)).toEqual({
      source: 'fallback',
      day: 3,
      readingId: 8,
      listeningId: 7,
    });
    expect(pickToday(plan, base, TODAY)).toEqual({ source: 'finished' });
  });

  it('keeps the last plan day for the rest of the day it was finished', () => {
    const states = [
      lesson(1, 'reading', '2026-10-20T03:00:00Z'),
      lesson(2, 'listening', '2026-10-20T03:00:00Z'),
      lesson(3, 'reading', '2026-10-24T02:00:00Z'),
      lesson(4, 'listening', '2026-10-24T02:30:00Z'),
      lesson(5, 'reading'),
    ];
    expect(pickToday(plan, states, '2026-10-24')).toMatchObject({ source: 'plan', day: 2 });
    expect(pickToday(plan, states, '2026-10-25')).toMatchObject({
      source: 'fallback',
      readingId: 5,
    });
  });
});

describe('step helpers', () => {
  it('estimates minutes like the mockup', () => {
    expect(lessonMinutes({ kind: 'reading', wordCount: 180, durationMs: null })).toBe(5);
    expect(lessonMinutes({ kind: 'listening', wordCount: 90, durationMs: 42_000 })).toBe(6);
  });

  it('marks reviews done when nothing is due', () => {
    expect(reviewStep({ due: 0, doneToday: 0 }).status).toBe('done');
    expect(reviewStep({ due: 0, doneToday: 5 })).toMatchObject({
      status: 'done',
      progressPct: 100,
    });
    expect(reviewStep({ due: 18, doneToday: 0 })).toMatchObject({
      status: 'not_started',
      minutes: 4,
    });
    expect(reviewStep({ due: 3, doneToday: 1 })).toMatchObject({
      status: 'in_progress',
      progressPct: 25,
    });
  });
});

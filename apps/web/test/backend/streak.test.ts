import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday, weekDates } from '../../src/backend/logic/calendar';
import { localDate } from '../../src/backend/logic/srs';
import {
  computeStreak,
  isActiveDay,
  weekMinutes,
  type ActivityDay,
} from '../../src/backend/logic/streak';

const day = (date: string, d: Partial<ActivityDay> = {}): ActivityDay => ({
  date,
  secondsStudied: 0,
  lessonsDone: 0,
  reviewsDone: 0,
  ...d,
});

describe('calendar', () => {
  it('shifts dates across months and finds ISO weekdays', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(isoWeekday('2026-10-24')).toBe(6); // Saturday
    expect(isoWeekday('2026-10-25')).toBe(7); // Sunday
    expect(weekDates('2026-10-25')[0]).toBe('2026-10-19');
    expect(weekDates('2026-10-19')).toHaveLength(7);
  });
});

describe('streak', () => {
  it('counts a day with ≥ 1 minute, a lesson or a review', () => {
    expect(isActiveDay(day('x', { secondsStudied: 59 }))).toBe(false);
    expect(isActiveDay(day('x', { secondsStudied: 60 }))).toBe(true);
    expect(isActiveDay(day('x', { lessonsDone: 1 }))).toBe(true);
    expect(isActiveDay(day('x', { reviewsDone: 1 }))).toBe(true);
  });

  it('ends today or yesterday, and breaks on a gap', () => {
    const days = [
      day('2026-10-20', { reviewsDone: 2 }),
      day('2026-10-22', { secondsStudied: 600 }),
      day('2026-10-23', { lessonsDone: 1 }),
    ];
    expect(computeStreak(days, '2026-10-23')).toEqual({ days: 2, activeToday: true });
    // Today not studied yet: the streak still counts up to yesterday.
    expect(computeStreak(days, '2026-10-24')).toEqual({ days: 2, activeToday: false });
    // Two days without study: lost.
    expect(computeStreak(days, '2026-10-25')).toEqual({ days: 0, activeToday: false });
    // An inactive row (30 s) does not count.
    expect(
      computeStreak([...days, day('2026-10-24', { secondsStudied: 30 })], '2026-10-24').days,
    ).toBe(2);
  });

  it('uses the Vietnam midnight boundary (UTC+7)', () => {
    // 23:59 and 00:01 in Ho Chi Minh City are different days, 2 minutes apart.
    const late = localDate(new Date('2026-10-23T16:59:00Z'));
    const early = localDate(new Date('2026-10-23T17:01:00Z'));
    expect(late).toBe('2026-10-23');
    expect(early).toBe('2026-10-24');
    const days = [day(late, { reviewsDone: 1 }), day(early, { reviewsDone: 1 })];
    expect(computeStreak(days, localDate(new Date('2026-10-24T10:00:00Z')))).toEqual({
      days: 2,
      activeToday: true,
    });
    // 17:00 UTC on the 24th is already 00:00 on the 25th in Vietnam: today not studied yet.
    expect(computeStreak(days, localDate(new Date('2026-10-24T17:00:00Z')))).toEqual({
      days: 2,
      activeToday: false,
    });
  });
});

describe('week bucketing', () => {
  it('buckets Monday → Sunday of the Vietnam week', () => {
    const sundayLate = localDate(new Date('2026-10-18T16:30:00Z')); // Sun 18, 23:30 VN
    const mondayEarly = localDate(new Date('2026-10-18T17:30:00Z')); // Mon 19, 00:30 VN
    expect(sundayLate).toBe('2026-10-18');
    expect(mondayEarly).toBe('2026-10-19');
    const days = [
      day(sundayLate, { secondsStudied: 3600 }),
      day(mondayEarly, { secondsStudied: 600 }),
      day('2026-10-24', { secondsStudied: 89 }),
      day('2026-10-26', { secondsStudied: 600 }),
    ];
    const week = weekMinutes(days, '2026-10-24');
    expect(week.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(week.map((d) => d.minutes)).toEqual([10, 0, 0, 0, 0, 1, 0]);
    // Sunday belongs to the week that started on Monday.
    expect(weekMinutes(days, '2026-10-25')[0]!.minutes).toBe(10);
  });
});

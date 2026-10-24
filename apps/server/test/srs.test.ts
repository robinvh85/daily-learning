import { formatIntervalVi } from '@daily-learning/shared';
import { describe, expect, it } from 'vitest';
import {
  localDate,
  newCardColumns,
  previewRatings,
  review,
  startOfLocalDay,
  vocabStatus,
  type CardColumns,
} from '../src/services/srs.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = new Date('2026-10-24T02:00:00Z'); // 09:00 in Ho Chi Minh City
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Rate a card at `t` and return the new card. */
const rate = (c: CardColumns, r: 1 | 2 | 3 | 4, t: Date) => review(c, r, t).card;

describe('newCardColumns', () => {
  it('is a New card due now', () => {
    const c = newCardColumns(T0);
    expect(c).toMatchObject({ state: 0, reps: 0, lapses: 0, stability: 0, lastReview: null });
    expect(c.due.getTime()).toBe(T0.getTime());
    expect(vocabStatus(c.state, c.stability)).toBe('new');
  });
});

describe('review (FSRS default parameters)', () => {
  it('moves New → Learning on Again/Hard/Good with short steps', () => {
    const c = newCardColumns(T0);
    const again = rate(c, 1, T0);
    expect(again.state).toBe(1);
    expect(again.due.getTime() - T0.getTime()).toBe(1 * MIN);
    const hard = rate(c, 2, T0);
    expect(hard.state).toBe(1);
    expect(hard.due.getTime() - T0.getTime()).toBe(6 * MIN);
    const good = rate(c, 3, T0);
    expect(good.state).toBe(1);
    expect(good.due.getTime() - T0.getTime()).toBe(10 * MIN);
    expect(good.reps).toBe(1);
    expect(good.lastReview?.getTime()).toBe(T0.getTime());
  });

  it('moves New → Review on Easy, due in whole days', () => {
    const easy = rate(newCardColumns(T0), 4, T0);
    expect(easy.state).toBe(2);
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(easy.due.getTime() - T0.getTime()).toBe(easy.scheduledDays * DAY);
    expect(vocabStatus(easy.state, easy.stability)).toBe('learning');
  });

  it('graduates Learning → Review after Good, Good', () => {
    let c = rate(newCardColumns(T0), 3, T0);
    c = rate(c, 3, at(10 * MIN));
    expect(c.state).toBe(2);
    expect(c.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(c.reps).toBe(2);
    expect(c.lapses).toBe(0);
  });

  it('counts a lapse when a Review card is forgotten, then relearns it', () => {
    let c = rate(newCardColumns(T0), 4, T0);
    const due = c.due;
    const before = c.stability;
    c = rate(c, 1, due);
    expect(c.state).toBe(3); // Relearning
    expect(c.lapses).toBe(1);
    expect(c.stability).toBeLessThan(before);
    expect(c.due.getTime() - due.getTime()).toBe(10 * MIN);
    expect(vocabStatus(c.state, c.stability)).toBe('learning');
    c = rate(c, 3, c.due);
    expect(c.state).toBe(2);
    expect(c.lapses).toBe(1);
  });

  it('grows the interval with successful reviews until the word is known', () => {
    let c = rate(newCardColumns(T0), 4, T0);
    const intervals: number[] = [c.scheduledDays];
    for (let i = 0; i < 4; i++) {
      c = rate(c, 3, c.due);
      intervals.push(c.scheduledDays);
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]!);
    }
    expect(c.stability).toBeGreaterThanOrEqual(21);
    expect(vocabStatus(c.state, c.stability)).toBe('known');
  });

  it('logs the rating, elapsed days and the previous state', () => {
    const first = review(newCardColumns(T0), 4, T0);
    expect(first.log).toMatchObject({ rating: 4, elapsedDays: 0, state: 0 });
    const second = review(first.card, 3, at(3 * DAY));
    expect(second.log.elapsedDays).toBe(3);
    expect(second.log.state).toBe(2);
    expect(second.log.due.getTime()).toBe(second.card.due.getTime());
  });
});

describe('previewRatings', () => {
  it('matches what review() would do for each rating', () => {
    const c = rate(newCardColumns(T0), 4, T0);
    const t = c.due;
    const previews = previewRatings(c, t);
    expect(previews.map((p) => p.rating)).toEqual([1, 2, 3, 4]);
    for (const p of previews) {
      expect(p.due.getTime()).toBe(rate(c, p.rating, t).due.getTime());
    }
    // Again < Hard ≤ Good < Easy
    const d = previews.map((p) => p.due.getTime());
    expect(d[0]).toBeLessThan(d[1]!);
    expect(d[1]).toBeLessThanOrEqual(d[2]!);
    expect(d[2]).toBeLessThan(d[3]!);
  });

  it('formats a new card in Vietnamese', () => {
    const labels = previewRatings(newCardColumns(T0), T0).map((p) => p.interval);
    expect(labels.slice(0, 3)).toEqual(['1 phút', '6 phút', '10 phút']);
    expect(labels[3]).toMatch(/^\d+ ngày$/);
  });
});

describe('formatIntervalVi', () => {
  it.each([
    [30_000, '1 phút'],
    [10 * MIN, '10 phút'],
    [3 * 60 * MIN, '3 giờ'],
    [DAY, '1 ngày'],
    [3 * DAY, '3 ngày'],
    [13 * DAY, '13 ngày'],
    [14 * DAY, '2 tuần'],
    [90 * DAY, '3 tháng'],
    [365 * DAY, '1 năm'],
    [548 * DAY, '1,5 năm'],
  ])('%d ms → %s', (ms, label) => {
    expect(formatIntervalVi(ms)).toBe(label);
  });
});

describe('local day (Asia/Ho_Chi_Minh)', () => {
  it('starts at 00:00 UTC+7', () => {
    expect(startOfLocalDay(new Date('2026-10-24T16:59:00Z')).toISOString()).toBe(
      '2026-10-23T17:00:00.000Z',
    );
    expect(startOfLocalDay(new Date('2026-10-24T17:00:00Z')).toISOString()).toBe(
      '2026-10-24T17:00:00.000Z',
    );
    expect(localDate(new Date('2026-10-24T17:30:00Z'))).toBe('2026-10-25');
  });
});

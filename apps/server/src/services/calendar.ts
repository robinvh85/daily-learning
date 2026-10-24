/**
 * Local calendar helpers (Asia/Ho_Chi_Minh). Dates are `YYYY-MM-DD` strings as stored in
 * `daily_activity.date`; "today" comes from `localDate(now)` in srs.ts.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function parse(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** `date` shifted by `days` (may be negative). */
export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday: 1 Monday … 7 Sunday. */
export function isoWeekday(date: string): number {
  const d = new Date(parse(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The 7 dates (Monday → Sunday) of the week containing `date`. */
export function weekDates(date: string): string[] {
  const monday = addDays(date, 1 - isoWeekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

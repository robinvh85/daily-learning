/** Dates and durations in Vietnamese, on the Asia/Ho_Chi_Minh calendar (UTC+7, no DST). */
import { VN_OFFSET_MS } from '@daily-learning/shared';

const WEEKDAYS_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Short labels for the week chart, Monday → Sunday. */
export const WEEK_LABELS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
export const WEEK_NAMES_VI = [...WEEKDAYS_VI.slice(1), WEEKDAYS_VI[0]!] as const;

/** "Thứ Bảy, 24/10/2026" for the moment `now`, in Vietnam time. */
export function formatVnDate(now: Date): string {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS_VI[d.getUTCDay()]}, ${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** "1 giờ 32 phút", "45 phút", "2 giờ". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

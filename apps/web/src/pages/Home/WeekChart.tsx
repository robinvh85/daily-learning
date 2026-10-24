import type { WeekDayDto } from '@daily-learning/shared/api';
import { WEEK_LABELS_VI, WEEK_NAMES_VI } from '../../lib/date';
import styles from './Home.module.css';

/**
 * Minutes per day, Monday → Sunday. Days below the goal use the light bar color (mockup).
 * The bars are decorative; screen readers get a summary and a visually hidden table.
 */
export function WeekChart({ days, goal }: { days: readonly WeekDayDto[]; goal: number }) {
  const max = Math.max(goal, ...days.map((d) => d.minutes), 1);
  const reached = days.filter((d) => d.minutes >= goal).length;
  return (
    <figure className={styles.week}>
      <div className={styles.bars} aria-hidden="true">
        {days.map((d) => (
          <div
            key={d.date}
            className={d.minutes >= goal ? styles.bar : `${styles.bar} ${styles.barLow}`}
            style={{ height: `${Math.max(4, Math.round((d.minutes / max) * 100))}%` }}
            data-testid="week-bar"
          />
        ))}
      </div>
      <div className={styles.barLabels} aria-hidden="true">
        {WEEK_LABELS_VI.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <figcaption className="visually-hidden">
        Số phút học mỗi ngày tuần này. Đạt mục tiêu {goal} phút: {reached} / 7 ngày.
      </figcaption>
      <table className="visually-hidden">
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Số phút</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.date}>
              <th scope="row">{WEEK_NAMES_VI[i]}</th>
              <td>{d.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

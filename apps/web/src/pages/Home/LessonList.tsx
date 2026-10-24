import type { LessonKind } from '@daily-learning/shared';
import { Link } from 'react-router-dom';
import { useLessons } from '../../api/hooks';
import { lessonHref, topicLabel } from '../../lib/labels';
import styles from './Home.module.css';

const STATUS_VI = { not_started: '', in_progress: 'Đang học', completed: 'Đã xong' } as const;

/** Simple lesson list (the full library with filters comes in Phase 5). */
export function LessonList({ kind }: { kind?: LessonKind }) {
  const lessons = useLessons(kind ? { kind } : {});
  if (lessons.isPending) return <p className={styles.muted}>Đang tải danh sách bài…</p>;
  if (lessons.isError) {
    return (
      <p role="alert" className={styles.error}>
        Không tải được danh sách bài: {lessons.error.message}
      </p>
    );
  }
  if (lessons.data.lessons.length === 0) {
    return (
      <p className={styles.muted}>Chưa có bài nào. Chạy `npm run content:sync` để nạp bài học.</p>
    );
  }
  return (
    <ul className={styles.list}>
      {lessons.data.lessons.map((l) => (
        <li key={l.id}>
          <Link to={lessonHref(l)} className={styles.lesson}>
            <span className={styles.kind} data-kind={l.kind}>
              {l.kind === 'reading' ? 'Đọc' : 'Nghe'}
            </span>
            <span className={styles.lessonTitle} lang="en">
              {l.title}
            </span>
            <span className={styles.meta}>
              {l.level} · {topicLabel(l.topic)} · {l.wordCount} từ
              {l.progress && STATUS_VI[l.progress.status]
                ? ` · ${STATUS_VI[l.progress.status]}`
                : ''}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Library pages `/read` and `/listen`: filter by level and topic, status per lesson. */
import { LESSON_LEVELS, type LessonKind } from '@daily-learning/shared';
import type { LessonSummary } from '@daily-learning/shared/api';
import { Link, useSearchParams } from 'react-router-dom';
import { useLessons } from '../../api/hooks';
import { lessonHref, topicLabel } from '../../lib/labels';
import { LESSON_STATUS_VI, lessonDuration, lessonStatus } from '../../lib/lessonMeta';
import styles from './LibraryPage.module.css';

const TITLES: Record<LessonKind, string> = {
  reading: 'Thư viện bài đọc',
  listening: 'Thư viện bài nghe',
};

export function LibraryPage({ kind }: { kind: LessonKind }) {
  const lessons = useLessons({ kind });
  const [params, setParams] = useSearchParams();
  const level = params.get('level');
  const topic = params.get('topic');

  function setFilter(key: 'level' | 'topic', value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const all = lessons.data?.lessons ?? [];
  // Only offer the levels and topics that exist.
  const levels = LESSON_LEVELS.filter((l) => all.some((x) => x.level === l));
  const topics = [...new Set(all.map((l) => l.topic))].sort((a, b) =>
    topicLabel(a).localeCompare(topicLabel(b), 'vi'),
  );
  const shown = all.filter((l) => (!level || l.level === level) && (!topic || l.topic === topic));

  return (
    <>
      <header>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link to="/">Trang chủ</Link> › {kind === 'reading' ? 'Đọc' : 'Nghe'}
        </nav>
        <h1 className={styles.h1}>{TITLES[kind]}</h1>
      </header>

      {lessons.isPending ? (
        <p className={styles.muted} role="status">
          Đang tải danh sách bài…
        </p>
      ) : lessons.isError ? (
        <p role="alert" className={styles.error}>
          Không tải được danh sách bài: {lessons.error.message}
        </p>
      ) : all.length === 0 ? (
        <p className={styles.muted}>
          Chưa có bài nào. Chạy <code>npm run content:sync</code> để nạp bài học.
        </p>
      ) : (
        <>
          <div className={styles.filters}>
            <ChipGroup
              label="Cấp độ"
              options={levels.map((l) => ({ value: l, label: l }))}
              value={level}
              onChange={(v) => setFilter('level', v)}
            />
            <ChipGroup
              label="Chủ đề"
              options={topics.map((t) => ({ value: t, label: topicLabel(t) }))}
              value={topic}
              onChange={(v) => setFilter('topic', v)}
            />
          </div>
          <p className={styles.count} aria-live="polite">
            {shown.length} bài
          </p>
          {shown.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.muted}>Không có bài nào phù hợp với bộ lọc.</p>
              <button type="button" className={styles.chip} onClick={() => setParams({})}>
                Bỏ lọc
              </button>
            </div>
          ) : (
            <ul className={styles.grid}>
              {shown.map((l) => (
                <li key={l.id}>
                  <LessonCard lesson={l} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div role="group" aria-label={`Lọc theo ${label.toLowerCase()}`} className={styles.group}>
      <span className={styles.groupLabel} aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        Tất cả
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.chip}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LessonCard({ lesson: l }: { lesson: LessonSummary }) {
  const status = lessonStatus(l);
  return (
    <Link to={lessonHref(l)} className={styles.card}>
      <span className={styles.cardTop}>
        <span className={styles.level}>{l.level}</span>
        <span className={styles.status} data-status={status}>
          {LESSON_STATUS_VI[status]}
        </span>
      </span>
      <span className={styles.title} lang="en">
        {l.title}
      </span>
      <span className={styles.meta}>
        {topicLabel(l.topic)} · {l.kind === 'reading' ? `${l.wordCount} từ · ` : ''}
        {lessonDuration(l)}
      </span>
    </Link>
  );
}

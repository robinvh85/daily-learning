/** `/grammar`: every grammar point by level, with the learner's status (grammar plan 3.4). */
import { LESSON_LEVELS } from '@daily-learning/shared';
import type { GrammarSummary } from '@daily-learning/shared/api';
import { Link } from 'react-router-dom';
import { useGrammarList } from '../../api/hooks';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { grammarGroupLabel, grammarHref } from '../../lib/labels';
import lib from '../Library/LibraryPage.module.css';
import styles from './GrammarLibraryPage.module.css';

const STATUS_VI = {
  not_started: 'Chưa học',
  in_progress: 'Đang học',
  completed: 'Đã học',
} as const;

function statusOf(g: GrammarSummary): keyof typeof STATUS_VI {
  return g.progress?.status ?? 'not_started';
}

export function GrammarLibraryPage() {
  const list = useGrammarList();
  useDocumentTitle('Ngữ pháp');
  const points = list.data?.points ?? [];
  const done = points.filter((g) => statusOf(g) === 'completed').length;

  return (
    <>
      <header>
        <nav aria-label="Breadcrumb" className={lib.breadcrumb}>
          <Link to="/">Trang chủ</Link> › Ngữ pháp
        </nav>
        <h1 className={lib.h1}>Ngữ pháp</h1>
        <p className={styles.intro}>
          Mỗi ngày trong lộ trình có một điểm ngữ pháp, lấy ví dụ từ chính bài đọc và bài nghe của
          ngày đó.
        </p>
      </header>

      {list.isPending ? (
        <p className={lib.muted} role="status">
          Đang tải danh sách ngữ pháp…
        </p>
      ) : list.isError ? (
        <p role="alert" className={lib.error}>
          Không tải được danh sách ngữ pháp: {list.error.message}
        </p>
      ) : points.length === 0 ? (
        <p className={lib.muted}>Chưa có điểm ngữ pháp nào.</p>
      ) : (
        <>
          <p className={lib.count}>
            Đã học {done}/{points.length} điểm ngữ pháp
          </p>
          {LESSON_LEVELS.filter((level) => points.some((g) => g.level === level)).map((level) => (
            <section key={level} aria-labelledby={`level-${level}`} className={styles.level}>
              <h2 id={`level-${level}`} className={styles.h2}>
                {level}
              </h2>
              <ul className={lib.grid}>
                {points
                  .filter((g) => g.level === level)
                  .map((g) => (
                    <li key={g.slug}>
                      <GrammarCard point={g} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function GrammarCard({ point: g }: { point: GrammarSummary }) {
  const status = statusOf(g);
  const score = g.progress?.score;
  return (
    <Link to={grammarHref(g.slug)} className={lib.card}>
      <span className={lib.cardTop}>
        <span className={styles.group}>{grammarGroupLabel(g.group)}</span>
        <span className={lib.status} data-status={status}>
          {STATUS_VI[status]}
          {status === 'completed' && typeof score === 'number' && ` · ${Math.round(score * 100)}%`}
        </span>
      </span>
      <span className={lib.title}>{g.title}</span>
      <span className={styles.titleEn} lang="en">
        {g.titleEn}
      </span>
      <span className={lib.meta}>
        {g.days.length > 0 ? `Ngày ${g.days.join(', ')} · ` : ''}
        {g.exerciseCount} bài tập
        {g.draft ? ' · bản nháp' : ''}
      </span>
    </Link>
  );
}

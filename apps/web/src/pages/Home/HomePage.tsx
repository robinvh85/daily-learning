import { LessonList } from './LessonList';
import styles from './Home.module.css';

/** Placeholder home page; Phase 5 builds "today's lesson", streak and progress. */
export function HomePage() {
  return (
    <>
      <header>
        <p className={styles.eyebrow}>DailyLearning</p>
        <h1 className={styles.h1}>Chào mừng trở lại</h1>
        <p className={styles.muted}>Mỗi ngày khoảng 15 phút: Đọc → Nghe → Ôn từ.</p>
      </header>
      <section aria-labelledby="lessons-title" className={styles.card}>
        <h2 id="lessons-title" className={styles.h2}>
          Bài học
        </h2>
        <LessonList />
      </section>
    </>
  );
}

export function LessonListPage({ kind }: { kind: 'reading' | 'listening' }) {
  return (
    <>
      <header>
        <h1 className={styles.h1}>{kind === 'reading' ? 'Bài đọc' : 'Bài nghe'}</h1>
      </header>
      <section aria-label="Danh sách bài" className={styles.card}>
        <LessonList kind={kind} />
      </section>
    </>
  );
}

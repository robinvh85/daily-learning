/** Home (mockup Main.dc.html): greeting, today's lesson, progress cards and the libraries. */
import type { DashboardResponse, TodayResponse, TodayStepDto } from '@daily-learning/shared/api';
import { Link } from 'react-router-dom';
import { useDashboard, useLessons, useToday } from '../../api/hooks';
import { formatMinutes, formatVnDate } from '../../lib/date';
import { lessonDuration, pickLibraryLessons } from '../../lib/lessonMeta';
import { formatTime } from '../../lib/time';
import { WeekChart } from './WeekChart';
import styles from './Home.module.css';

const STEP_LABEL: Record<TodayStepDto['kind'], string> = {
  reading: 'Đọc',
  listening: 'Nghe',
  reviews: 'Ôn từ',
};
const STEP_STATUS: Record<TodayStepDto['status'], string> = {
  not_started: 'Chưa học',
  in_progress: 'Đang học',
  done: 'Đã xong',
};

export function HomePage() {
  const dashboard = useDashboard();
  const today = useToday();
  const d = dashboard.data;

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.date}>{formatVnDate(new Date())}</p>
          <h1 className={styles.h1}>
            {d ? `Chào ${d.displayName}, hôm nay học ${d.week.dailyGoalMin} phút nhé` : 'Chào bạn'}
          </h1>
        </div>
        {d && (
          <div className={styles.chips}>
            <span className={styles.chip}>
              <span className={styles.streakDot} aria-hidden="true" />
              Chuỗi {d.streak.days} ngày
            </span>
            <span className={styles.chip}>Trình độ: {d.level}</span>
          </div>
        )}
      </header>

      {today.isPending ? (
        <p className={styles.muted} role="status">
          Đang tải bài học hôm nay…
        </p>
      ) : today.isError ? (
        <p role="alert" className={styles.error}>
          Không tải được bài học hôm nay: {today.error.message}
        </p>
      ) : (
        <TodayCard today={today.data} />
      )}

      {dashboard.isError ? (
        <p role="alert" className={styles.error}>
          Không tải được tiến độ: {dashboard.error.message}
        </p>
      ) : d ? (
        <StatCards d={d} />
      ) : null}

      <div className={styles.libraries}>
        <LibraryCard kind="reading" today={today.data} />
        <LibraryCard kind="listening" today={today.data} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Today's lesson
// ---------------------------------------------------------------------------

function TodayCard({ today }: { today: TodayResponse }) {
  const current = today.steps.find((s) => s.status !== 'done');
  const eyebrow =
    today.source === 'finished' ? 'Bài học hôm nay' : `Bài học hôm nay · Bài ${today.day}`;
  return (
    <section aria-labelledby="today-title" className={styles.today}>
      <div className={styles.todayHead}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id="today-title" className={styles.todayTitle}>
            {today.title}
          </h2>
          <p className={styles.muted}>
            {today.allDone
              ? today.source === 'finished'
                ? 'Bạn đã học hết bài hiện có. Bài mới sẽ sớm được thêm.'
                : 'Bạn đã hoàn thành bài hôm nay. Bài tiếp theo sẽ có vào ngày mai.'
              : `Còn khoảng ${today.estimatedMinutes} phút`}
          </p>
        </div>
        {today.continueUrl ? (
          <Link to={today.continueUrl} className={styles.primary}>
            Tiếp tục học
          </Link>
        ) : (
          <Link to="/read" className={styles.secondary}>
            Xem thư viện
          </Link>
        )}
      </div>
      <ol className={styles.steps} aria-label="Các bước hôm nay">
        {today.steps.map((s, i) => (
          <li key={s.kind}>
            <StepCard step={s} n={i + 1} current={s === current} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function stepTitle(s: TodayStepDto): string {
  if (s.lesson) return s.lesson.title;
  const r = s.reviews ?? { due: 0, doneToday: 0 };
  if (r.due > 0) return `${r.due} từ đến hạn ôn`;
  return r.doneToday > 0 ? `Đã ôn ${r.doneToday} từ hôm nay` : 'Không có từ đến hạn';
}

function stepMeta(s: TodayStepDto): string {
  const time = `${s.minutes} phút`;
  if (s.kind === 'reading') return `${s.lesson?.wordCount ?? 0} từ · ${time}`;
  if (s.kind === 'listening') {
    const audio = s.lesson?.durationMs ? formatTime(s.lesson.durationMs) : 'chưa có audio';
    return `${audio} · ${time}`;
  }
  return s.minutes > 0 ? `Lặp lại ngắt quãng · ${time}` : 'Lặp lại ngắt quãng';
}

function StepCard({ step: s, n, current }: { step: TodayStepDto; n: number; current: boolean }) {
  return (
    <Link
      to={s.url}
      className={`${styles.step} ${current ? styles.stepCurrent : ''}`}
      data-kind={s.kind}
      aria-current={current ? 'step' : undefined}
    >
      <span className={styles.stepTop}>
        <span className={styles.stepKind}>
          {n} · {STEP_LABEL[s.kind]}
        </span>
        <span className={styles.stepStatus} data-status={s.status}>
          {STEP_STATUS[s.status]}
        </span>
      </span>
      <span className={styles.stepTitle} lang={s.lesson ? 'en' : undefined}>
        {stepTitle(s)}
      </span>
      <span className={styles.stepMeta}>{stepMeta(s)}</span>
      <span className={styles.track} aria-hidden="true">
        <span
          className={styles.fill}
          data-status={s.status}
          style={{ width: `${s.progressPct}%` }}
        />
      </span>
      <span className="visually-hidden">, tiến độ {s.progressPct}%</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Progress cards
// ---------------------------------------------------------------------------

function StatCards({ d }: { d: DashboardResponse }) {
  return (
    <section aria-label="Tiến độ" className={styles.stats}>
      <div className={styles.stat}>
        <h2 className={styles.statLabel}>Lộ trình A2 → B1</h2>
        <p className={styles.statValue}>{d.path.percent}%</p>
        <div
          className={styles.pathTrack}
          role="progressbar"
          aria-label={`Tiến độ cấp ${d.path.level}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={d.path.percent}
        >
          <div className={styles.pathFill} style={{ width: `${d.path.percent}%` }} />
        </div>
        <p className={styles.statNote}>
          Bài {d.path.completed} / {d.path.total} của cấp {d.path.level}
        </p>
      </div>
      <div className={styles.stat}>
        <h2 className={styles.statLabel}>Từ vựng đã nhớ</h2>
        <p className={styles.statValue}>{d.words.remembered}</p>
        <p className={styles.pills}>
          <span className={styles.pillKnown}>Thuộc {d.words.known}</span>
          <span className={styles.pillLearning}>Đang ôn {d.words.learning}</span>
        </p>
        <p className={styles.statNote}>Trong Oxford 3000: {d.words.oxford3000}</p>
      </div>
      <div className={styles.stat}>
        <h2 className={styles.statLabel}>Tuần này · mục tiêu {d.week.dailyGoalMin} phút/ngày</h2>
        <p className={styles.statValue}>{formatMinutes(d.week.totalMinutes)}</p>
        <WeekChart days={d.week.days} goal={d.week.dailyGoalMin} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Libraries
// ---------------------------------------------------------------------------

const LIBRARY = {
  reading: { title: 'Thư viện bài đọc', href: '/read', all: 'Xem tất cả bài đọc' },
  listening: { title: 'Thư viện bài nghe', href: '/listen', all: 'Xem tất cả bài nghe' },
} as const;

function LibraryCard({
  kind,
  today,
}: {
  kind: 'reading' | 'listening';
  today: TodayResponse | undefined;
}) {
  const lessons = useLessons({ kind });
  const meta = LIBRARY[kind];
  const id = `lib-${kind}`;
  const exclude = new Set((today?.steps ?? []).flatMap((s) => (s.lesson ? [s.lesson.id] : [])));
  const items = lessons.data ? pickLibraryLessons(lessons.data.lessons, exclude) : [];

  return (
    <section aria-labelledby={id} className={styles.library}>
      <div className={styles.libraryHead}>
        <h2 id={id} className={styles.h2}>
          {meta.title}
        </h2>
        <Link to={meta.href} className={styles.seeAll} aria-label={meta.all}>
          Xem tất cả
        </Link>
      </div>
      {lessons.isPending ? (
        <p className={styles.muted}>Đang tải…</p>
      ) : lessons.isError ? (
        <p role="alert" className={styles.error}>
          Không tải được danh sách bài: {lessons.error.message}
        </p>
      ) : items.length === 0 ? (
        <p className={styles.libraryEmpty}>Chưa có bài nào khác ngoài bài hôm nay.</p>
      ) : (
        <ul className={styles.libraryList}>
          {items.map((l) => (
            <li key={l.id}>
              <Link to={`${meta.href}/${l.slug}`} className={styles.libraryRow}>
                <span className={styles.libraryTitle} lang="en">
                  {l.title}
                </span>
                <span className={styles.libraryMeta}>
                  {l.level} · {lessonDuration(l)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

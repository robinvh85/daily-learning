/**
 * A grammar point (grammar plan 3.3) in three steps: 1. Nhận ra (lesson sentences, a question,
 * then the answer), 2. Quy tắc (forms, usage, mistakes), 3. Luyện tập (exercises checked by the
 * backend). Finishing every exercise completes the point.
 */
import type { GrammarDetailResponse, GrammarExerciseDto } from '@daily-learning/shared/api';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError } from '../../api/client';
import { useGrammar, useSubmitGrammarAnswer, useUpdateGrammarProgress } from '../../api/hooks';
import {
  GrammarExercise,
  type ExerciseResult,
} from '../../components/GrammarExercise/GrammarExercise';
import { HighlightedText } from '../../components/HighlightedText/HighlightedText';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { grammarGroupLabel, lessonHref } from '../../lib/labels';
import styles from './GrammarPage.module.css';

const STEPS = ['Nhận ra', 'Quy tắc', 'Luyện tập'] as const;
/** Sentences shown in "Nhận ra" before "Xem thêm câu". */
const FIRST_EXAMPLES = 4;

export function GrammarPage() {
  const { slug = '' } = useParams();
  const grammar = useGrammar(slug);
  useDocumentTitle(
    grammar.data
      ? `${grammar.data.point.title} – Ngữ pháp`
      : grammar.isError
        ? 'Không tìm thấy điểm ngữ pháp'
        : 'Ngữ pháp',
  );

  if (grammar.isPending) {
    return (
      <p className={styles.status} role="status">
        Đang tải điểm ngữ pháp…
      </p>
    );
  }
  if (grammar.isError) {
    const notFound = grammar.error instanceof ApiRequestError && grammar.error.status === 404;
    return (
      <div className={styles.status} role="alert">
        <p>
          {notFound
            ? 'Không tìm thấy điểm ngữ pháp này.'
            : `Không tải được điểm ngữ pháp: ${grammar.error.message}`}
        </p>
        <Link to="/grammar">Về thư viện ngữ pháp</Link>
      </div>
    );
  }
  return <GrammarLesson key={slug} slug={slug} data={grammar.data} />;
}

function GrammarLesson({ slug, data }: { slug: string; data: GrammarDetailResponse }) {
  const { point, discover, exercises } = data;
  const progress = useUpdateGrammarProgress(slug);
  const submit = useSubmitGrammarAnswer(slug);
  const completed = point.progress?.status === 'completed';
  /** Furthest step reached (saved). */
  const [reached, setReached] = useState(point.progress?.step ?? 0);
  /** Step on screen. */
  const [view, setView] = useState(point.progress?.step ?? 0);
  const [revealed, setRevealed] = useState(false);
  const [allExamples, setAllExamples] = useState(false);
  const [results, setResults] = useState<Record<number, ExerciseResult>>({});
  const resultsRef = useRef(results);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by "Làm lại" so the exercise inputs start empty. */
  const [attempt, setAttempt] = useState(0);

  function go(to: number, extra: { status?: 'completed'; score?: number } = {}) {
    setView(to);
    if (to > reached) setReached(to);
    if (to > reached || extra.status) progress.mutate({ step: Math.max(reached, to), ...extra });
    window.scrollTo?.({ top: 0 });
  }

  function answer(ex: GrammarExerciseDto, value: number | string, correction?: string) {
    setPendingId(ex.id);
    setError(null);
    const given =
      ex.type === 'choice' && typeof value === 'number'
        ? (ex.options[value] ?? '')
        : ex.type === 'find_error'
          ? `${String(value)} → ${correction ?? ''}`
          : String(value);
    submit.mutate(
      { exerciseId: ex.id, value, correction },
      {
        onSuccess: (res) => {
          const next = { ...resultsRef.current, [ex.id]: { ...res, given } };
          resultsRef.current = next;
          setResults(next);
          const done = exercises.filter((x) => next[x.id]);
          if (done.length === exercises.length) {
            const right = done.filter((x) => next[x.id]?.correct).length;
            progress.mutate({ step: 2, status: 'completed', score: right / exercises.length });
          }
        },
        onError: (err) => setError(`Không gửi được câu trả lời: ${err.message}`),
        onSettled: () => setPendingId(null),
      },
    );
  }

  function retry() {
    resultsRef.current = {};
    setResults({});
    setAttempt((a) => a + 1);
    window.scrollTo?.({ top: 0 });
  }

  const answered = exercises.filter((x) => results[x.id]);
  const right = answered.filter((x) => results[x.id]?.correct).length;
  const finished = answered.length === exercises.length && exercises.length > 0;
  const examples = allExamples ? discover.examples : discover.examples.slice(0, FIRST_EXAMPLES);

  return (
    <>
      <header className={styles.header}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link to="/">Trang chủ</Link> › <Link to="/grammar">Ngữ pháp</Link> › {point.level}
          {point.days.length > 0 && <> › Ngày {point.days.join(', ')}</>}
        </nav>
        <ol className={styles.steps} aria-label="Các bước">
          {STEPS.map((label, i) => {
            const done = completed || i < reached;
            const state = i === view ? styles.current : done ? styles.done : '';
            return (
              <li key={label} className={styles.stepItem}>
                {i > 0 && (
                  <span className={styles.stepSep} aria-hidden="true">
                    —
                  </span>
                )}
                <button
                  type="button"
                  className={`${styles.step} ${state}`}
                  aria-current={i === view ? 'step' : undefined}
                  disabled={i > reached && !completed}
                  onClick={() => go(i)}
                >
                  {i + 1}. {label}
                  {done && i !== view && <span className="visually-hidden"> (xong)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <article className={styles.article} aria-labelledby="grammar-title">
        <div className={styles.tags}>
          <span className={styles.tagLevel}>{point.level}</span>
          <span className={styles.tag}>{grammarGroupLabel(point.group)}</span>
          {point.draft && <span className={styles.tag}>Bản nháp</span>}
        </div>
        <h1 id="grammar-title" className={styles.title}>
          {point.title}
        </h1>
        <p className={styles.titleEn} lang="en">
          {point.titleEn}
        </p>

        {view === 0 && (
          <section aria-labelledby="discover-title" className={styles.section}>
            <h2 id="discover-title" className={styles.h2}>
              Nhìn các câu trong bài bạn đã học
            </h2>
            {examples.length === 0 ? (
              <p className={styles.muted}>Chưa có câu mẫu trong bài học.</p>
            ) : (
              <ul className={styles.examples}>
                {examples.map((e) => (
                  <li key={`${e.lessonSlug}#${e.segmentKey}`} className={styles.example}>
                    <p className={styles.exampleEn} lang="en">
                      <HighlightedText text={e.textEn} ranges={e.ranges} />
                    </p>
                    {e.textVi && <p className={styles.exampleVi}>{e.textVi}</p>}
                    <Link
                      className={styles.source}
                      to={lessonHref({ kind: e.lessonKind, slug: e.lessonSlug })}
                    >
                      {e.lessonKind === 'reading' ? 'Bài đọc' : 'Bài nghe'}:{' '}
                      <span lang="en">{e.lessonTitle}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!allExamples && discover.examples.length > FIRST_EXAMPLES && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => setAllExamples(true)}
              >
                Xem thêm {discover.examples.length - FIRST_EXAMPLES} câu
              </button>
            )}
            <div className={styles.question}>
              <p className={styles.questionText}>{discover.question}</p>
              {revealed ? (
                <p className={styles.answer} role="status">
                  {discover.answer}
                </p>
              ) : (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setRevealed(true)}
                >
                  Xem đáp án
                </button>
              )}
            </div>
            <div className={styles.next}>
              <button type="button" className={styles.primary} onClick={() => go(1)}>
                Tiếp: Quy tắc
              </button>
            </div>
          </section>
        )}

        {view === 1 && (
          <section aria-labelledby="rules-title" className={styles.section}>
            <h2 id="rules-title" className={styles.h2}>
              Quy tắc
            </h2>
            <p className={styles.summary}>{point.summary}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Dạng</th>
                    <th scope="col">Công thức</th>
                    <th scope="col">Ví dụ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.form.map((f) => (
                    <tr key={f.label}>
                      <th scope="row">{f.label}</th>
                      <td lang="en" className={styles.pattern}>
                        {f.pattern}
                      </td>
                      <td lang="en">{f.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={styles.h3}>Khi nào dùng</h3>
            <ul className={styles.list}>
              {data.usage.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>

            {data.signals.length > 0 && (
              <>
                <h3 className={styles.h3}>Dấu hiệu nhận biết</h3>
                <ul className={styles.signals} lang="en">
                  {data.signals.map((s) => (
                    <li key={s} className={styles.signal}>
                      {s}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.spelling.length > 0 && (
              <>
                <h3 className={styles.h3}>Chính tả</h3>
                <ul className={styles.list}>
                  {data.spelling.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {data.mistakes.length > 0 && (
              <>
                <h3 className={styles.h3}>Lỗi hay gặp</h3>
                <ul className={styles.mistakes}>
                  {data.mistakes.map((m) => (
                    <li key={m.wrong} className={styles.mistake}>
                      <p className={styles.mistakeWrong} lang="en">
                        <span className="visually-hidden">Sai: </span>
                        <s>{m.wrong}</s>
                      </p>
                      <p className={styles.mistakeRight} lang="en">
                        <span className="visually-hidden">Đúng: </span>
                        {m.right}
                      </p>
                      <p className={styles.mistakeWhy}>{m.why}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className={styles.next}>
              <button type="button" className={styles.primary} onClick={() => go(2)}>
                Tiếp: Luyện tập
              </button>
            </div>
          </section>
        )}

        {view === 2 && (
          <section aria-labelledby="practice-title" className={styles.section}>
            <div className={styles.practiceHead}>
              <h2 id="practice-title" className={styles.h2}>
                Luyện tập
              </h2>
              <span className={styles.score} aria-live="polite">
                {answered.length > 0
                  ? `Đúng ${right}/${exercises.length}`
                  : `${exercises.length} câu · mỗi câu trả lời một lần`}
              </span>
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.exercises}>
              {exercises.map((ex, i) => (
                <GrammarExercise
                  key={`${attempt}-${ex.id}`}
                  exercise={ex}
                  n={i + 1}
                  result={results[ex.id] ?? null}
                  pending={pendingId === ex.id}
                  onSubmit={(value, correction) => answer(ex, value, correction)}
                />
              ))}
            </div>
            {finished && (
              <div className={styles.finish} role="status">
                <p className={styles.finishTitle}>
                  Xong! Đúng {right}/{exercises.length} câu.
                </p>
                <p className={styles.muted}>
                  {right === exercises.length
                    ? 'Rất tốt. Điểm ngữ pháp này sẽ được đánh dấu là đã học.'
                    : 'Xem lại giải thích ở các câu sai, hoặc làm lại để chắc hơn.'}
                </p>
                <div className={styles.finishActions}>
                  <button type="button" className={styles.secondary} onClick={retry}>
                    Làm lại
                  </button>
                  <Link className={styles.primaryLink} to="/">
                    Về trang chủ
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </article>
    </>
  );
}

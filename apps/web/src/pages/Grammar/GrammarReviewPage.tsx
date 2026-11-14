/**
 * `/grammar/review` (grammar plan 3.5): due grammar points one by one, a few exercises each. The
 * result of the exercises becomes the FSRS rating (no self-grading).
 */
import type { GrammarExerciseDto, GrammarReviewItemDto } from '@daily-learning/shared/api';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  queryKeys,
  useGrammarReviews,
  useSubmitGrammarAnswer,
  useSubmitGrammarReview,
} from '../../api/hooks';
import {
  GrammarExercise,
  type ExerciseResult,
} from '../../components/GrammarExercise/GrammarExercise';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { grammarHref } from '../../lib/labels';
import lib from '../Library/LibraryPage.module.css';
import styles from './GrammarPage.module.css';

/** "sau 3 ngày" / "trong hôm nay". */
function nextReviewLabel(scheduledDays: number): string {
  return scheduledDays <= 0 ? 'trong hôm nay' : `sau ${scheduledDays} ngày`;
}

export function GrammarReviewPage() {
  const reviews = useGrammarReviews();
  const qc = useQueryClient();
  useDocumentTitle('Ôn ngữ pháp');
  const [at, setAt] = useState(0);
  // The queue is fixed while the page is open; refetch it next time.
  useEffect(() => () => void qc.invalidateQueries({ queryKey: queryKeys.grammarReviews }), [qc]);

  const items = reviews.data?.items ?? [];
  const item = items[at];

  return (
    <>
      <header>
        <nav aria-label="Breadcrumb" className={lib.breadcrumb}>
          <Link to="/">Trang chủ</Link> › <Link to="/grammar">Ngữ pháp</Link> › Ôn tập
        </nav>
        <h1 className={lib.h1}>Ôn ngữ pháp</h1>
      </header>
      {reviews.isPending ? (
        <p className={lib.muted} role="status">
          Đang tải…
        </p>
      ) : reviews.isError ? (
        <p role="alert" className={lib.error}>
          Không tải được danh sách ôn: {reviews.error.message}
        </p>
      ) : item ? (
        <>
          <p className={lib.count} aria-live="polite">
            Điểm {at + 1}/{items.length}
          </p>
          <ReviewItem key={item.point.slug} item={item} onNext={() => setAt((i) => i + 1)} />
        </>
      ) : (
        <div className={styles.finish} role="status">
          <p className={styles.finishTitle}>
            {items.length > 0
              ? `Xong! Bạn đã ôn ${items.length} điểm ngữ pháp.`
              : 'Không có điểm ngữ pháp nào đến hạn ôn.'}
          </p>
          <p className={styles.muted}>
            Điểm ngữ pháp được đưa vào ôn sau khi bạn làm xong phần luyện tập của nó.
          </p>
          <div className={styles.finishActions}>
            <Link className={styles.primaryLink} to="/">
              Về trang chủ
            </Link>
            <Link className={styles.secondary} to="/grammar">
              Thư viện ngữ pháp
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function ReviewItem({ item, onNext }: { item: GrammarReviewItemDto; onNext: () => void }) {
  const { point, exercises } = item;
  const answer = useSubmitGrammarAnswer(point.slug);
  const submitReview = useSubmitGrammarReview();
  const [results, setResults] = useState<Record<number, ExerciseResult>>({});
  const resultsRef = useRef(results);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onAnswer(ex: GrammarExerciseDto, value: number | string, correction?: string) {
    setPendingId(ex.id);
    setError(null);
    const given =
      ex.type === 'choice' && typeof value === 'number'
        ? (ex.options[value] ?? '')
        : ex.type === 'find_error'
          ? `${String(value)} → ${correction ?? ''}`
          : String(value);
    answer.mutate(
      { exerciseId: ex.id, value, correction },
      {
        onSuccess: (res) => {
          const next = { ...resultsRef.current, [ex.id]: { ...res, given } };
          resultsRef.current = next;
          setResults(next);
          if (exercises.every((x) => next[x.id])) {
            const correct = exercises.filter((x) => next[x.id]?.correct).length;
            submitReview.mutate({ slug: point.slug, correct, total: exercises.length });
          }
        },
        onError: (err) => setError(`Không gửi được câu trả lời: ${err.message}`),
        onSettled: () => setPendingId(null),
      },
    );
  }

  const done = submitReview.data;
  const right = exercises.filter((x) => results[x.id]?.correct).length;

  return (
    <article className={styles.article} aria-labelledby="review-title">
      <h2 id="review-title" className={styles.title}>
        {point.title}
      </h2>
      <p className={styles.titleEn} lang="en">
        {point.titleEn} · <Link to={grammarHref(point.slug)}>Xem lại quy tắc</Link>
      </p>
      <div className={styles.section}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.exercises}>
          {exercises.map((ex, i) => (
            <GrammarExercise
              key={ex.id}
              exercise={ex}
              n={i + 1}
              result={results[ex.id] ?? null}
              pending={pendingId === ex.id}
              onSubmit={(value, correction) => onAnswer(ex, value, correction)}
            />
          ))}
        </div>
        {submitReview.isError && (
          <p role="alert" className={styles.error}>
            Không lưu được kết quả ôn: {submitReview.error.message}
          </p>
        )}
        {done && (
          <div className={styles.finish} role="status">
            <p className={styles.finishTitle}>
              Đúng {right}/{exercises.length} câu. Ôn lại {nextReviewLabel(done.scheduledDays)}.
            </p>
            <div className={styles.finishActions}>
              <button type="button" className={styles.primary} onClick={onNext}>
                Tiếp
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Ôn từ vựng (mockup Vocab.dc.html): today's progress, the FSRS review card and the word book.
 *
 * Keyboard: Space/Enter flips the card, 1–4 rate it. The listener lives only while this page is
 * mounted and ignores typing in form fields, modified keys and the word book panel.
 */
import { formatIntervalVi, REVIEW_RATINGS, type ReviewRating } from '@daily-learning/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { queryKeys, useDueReviews, useSubmitReview } from '../../api/hooks';
import { Flashcard, type FlashcardHandle } from '../../components/Flashcard/Flashcard';
import { WordBook } from './WordBook';
import styles from './VocabPage.module.css';

/** Elements where keys must keep their normal meaning. */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** setTimeout cannot wait longer than ~24.8 days; we only need the near future. */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

function formatClock(d: Date): string {
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export function VocabPage() {
  const qc = useQueryClient();
  const due = useDueReviews();
  const submit = useSubmitReview();
  const [flippedFor, setFlippedFor] = useState<number | null>(null);
  const cardRef = useRef<FlashcardHandle>(null);
  /** Move focus only after the learner has interacted with the card. */
  const interacted = useRef(false);

  const card = due.data?.cards[0] ?? null;
  const flipped = card !== null && flippedFor === card.wordId;
  const counts = due.data?.counts ?? { due: 0, doneToday: 0 };
  const total = counts.doneToday + counts.due;
  const pct = total > 0 ? Math.round((counts.doneToday / total) * 100) : 0;

  const flip = () => {
    if (!card) return;
    interacted.current = true;
    setFlippedFor(card.wordId);
  };
  const rate = (rating: ReviewRating) => {
    if (!card || !flipped || submit.isPending) return;
    interacted.current = true;
    submit.mutate({ wordId: card.wordId, rating });
  };

  // Keep keyboard focus on the main action as the card flips and advances.
  useEffect(() => {
    if (interacted.current) cardRef.current?.focus();
  }, [card?.wordId, flipped]);

  // Latest handlers for the key listener, so it is bound once per mount.
  const keys = useRef({ flip, rate, flipped });
  useEffect(() => {
    keys.current = { flip, rate, flipped };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isEditable(target) || target?.closest('[data-card-keys="off"]')) return;
      const k = keys.current;
      if (e.key === ' ' || e.key === 'Enter') {
        // A focused button or link already reacts to Space/Enter natively.
        if (target?.closest('button, a, [role="button"]')) return;
        if (!k.flipped) {
          e.preventDefault();
          k.flip();
        }
        return;
      }
      const n = Number(e.key);
      if ((REVIEW_RATINGS as readonly number[]).includes(n) && k.flipped) {
        e.preventDefault();
        k.rate(n as ReviewRating);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Clock for the "next due in …" text, refreshed every 30 s.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Refetch when the next card becomes due (e.g. "Quên" → back in 1 minute).
  const nextDueAt = due.data?.nextDueAt ?? null;
  useEffect(() => {
    if (!nextDueAt || card) return;
    const wait = new Date(nextDueAt).getTime() - Date.now();
    if (wait > MAX_WAIT_MS) return;
    const id = setTimeout(
      () => void qc.invalidateQueries({ queryKey: queryKeys.dueReviews }),
      Math.max(0, wait) + 500,
    );
    return () => clearTimeout(id);
  }, [nextDueAt, card, qc]);

  return (
    <>
      <header className={styles.header}>
        <div>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link to="/">Trang chủ</Link> › Từ vựng
          </nav>
          <h1 className={styles.h1}>Ôn từ hôm nay</h1>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressRow}>
            <span className={styles.muted} id="review-progress-label">
              Đã ôn
            </span>
            <span className={styles.progressValue}>
              {counts.doneToday} / {total}
            </span>
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-labelledby="review-progress-label"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={counts.doneToday}
            aria-valuetext={`Đã ôn ${counts.doneToday} trên ${total} thẻ hôm nay`}
          >
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <div className={styles.columns}>
        <section aria-label="Thẻ từ" className={styles.study}>
          {due.isPending ? (
            <p role="status" className={styles.muted}>
              Đang tải thẻ cần ôn…
            </p>
          ) : due.isError ? (
            <p role="alert" className={styles.error}>
              Không tải được thẻ cần ôn: {due.error.message}
            </p>
          ) : card ? (
            <>
              <Flashcard
                key={card.wordId}
                ref={cardRef}
                card={card}
                flipped={flipped}
                onFlip={flip}
                onRate={rate}
                busy={submit.isPending}
              />
              {submit.isError && (
                <p role="alert" className={styles.error}>
                  Không lưu được kết quả: {submit.error.message}
                </p>
              )}
              <p className={styles.hint}>
                Hệ thống lặp lại ngắt quãng: từ càng dễ thì càng lâu mới hỏi lại.
                <br />
                Phím tắt: <kbd>Space</kbd> lật thẻ, <kbd>1</kbd>–<kbd>4</kbd> chọn mức nhớ.
              </p>
            </>
          ) : (
            <div className={styles.empty} role="status">
              <h2 className={styles.h2}>
                {total > 0 ? 'Xong rồi! Bạn đã ôn hết thẻ hôm nay.' : 'Chưa có thẻ nào cần ôn.'}
              </h2>
              <p className={styles.muted}>
                {nextDueAt
                  ? `Thẻ tiếp theo đến hạn sau ${formatIntervalVi(
                      new Date(nextDueAt).getTime() - nowMs,
                    )} (${formatClock(new Date(nextDueAt))}).`
                  : 'Lưu từ mới khi đọc hoặc nghe bài để có thẻ ôn.'}
              </p>
              <div className={styles.emptyLinks}>
                <Link to="/read" className={styles.linkButton}>
                  Đọc một bài
                </Link>
                <Link to="/listen" className={styles.linkButton}>
                  Nghe một bài
                </Link>
              </div>
            </div>
          )}
        </section>

        <div data-card-keys="off" className={styles.bookWrap}>
          <WordBook />
        </div>
      </div>
    </>
  );
}

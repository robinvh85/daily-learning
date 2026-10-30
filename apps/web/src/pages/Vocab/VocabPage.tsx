/**
 * Ôn từ vựng (mockup Vocab.dc.html): today's progress, the FSRS review card and the word book.
 *
 * The card is the first due card, or a word picked in the word book (due or not) until it is
 * answered. "Từ khác" skips a due card: it moves to the end of the local queue, nothing is sent.
 *
 * Keyboard: Space/Enter flips the card, number keys pick the n-th answer button (Quên, Khó,
 * Mai ôn, Nhớ, Dễ; no Mai ôn while Nhớ is only a day away), R plays
 * the word, S the example sentence, N/→ skips, ? opens the shortcuts list. The listener lives
 * only while this page is mounted and ignores typing in form fields, modified keys and the word
 * book panel.
 */
import { formatIntervalVi, type ReviewRating } from '@daily-learning/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  queryKeys,
  useDueReviews,
  usePostponeReview,
  useReviewCard,
  useSubmitReview,
} from '../../api/hooks';
import { Flashcard, type FlashcardHandle } from '../../components/Flashcard/Flashcard';
import { playExample, playWord, reviewChoices } from '../../components/Flashcard/review';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ShortcutsHelp } from './ShortcutsHelp';
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
  useDocumentTitle('Ôn từ vựng');
  const submit = useSubmitReview();
  const postpone = usePostponeReview();
  const busy = submit.isPending || postpone.isPending;
  const [flippedFor, setFlippedFor] = useState<number | null>(null);
  /** Word picked in the word book, shown until answered. */
  const [pickedId, setPickedId] = useState<number | null>(null);
  /** Due cards skipped with "Từ khác", in skip order: they go to the end of the queue. */
  const [skipped, setSkipped] = useState<number[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const cardRef = useRef<FlashcardHandle>(null);
  /** Move focus only after the learner has interacted with the card. */
  const interacted = useRef(false);

  const queue = useMemo(() => {
    const cards = due.data?.cards ?? [];
    const rank = new Map(skipped.map((id, i) => [id, i]));
    return [...cards.filter((c) => !rank.has(c.wordId))].concat(
      cards
        .filter((c) => rank.has(c.wordId))
        .sort((a, b) => rank.get(a.wordId)! - rank.get(b.wordId)!),
    );
  }, [due.data, skipped]);
  // A picked word that is due is already in the queue; others are fetched on their own.
  const pickedInQueue = queue.find((c) => c.wordId === pickedId) ?? null;
  const pickedCard = useReviewCard(pickedId !== null && !pickedInQueue ? pickedId : null);
  const card =
    pickedId === null ? (queue[0] ?? null) : (pickedInQueue ?? pickedCard.data?.card ?? null);
  const flipped = card !== null && flippedFor === card.wordId;
  const counts = due.data?.counts ?? { due: 0, doneToday: 0 };
  const total = counts.doneToday + counts.due;
  const pct = total > 0 ? Math.round((counts.doneToday / total) * 100) : 0;

  /** After an answer: back to the queue if the answered card was the picked one. */
  const answered = (res: { wordId: number }) =>
    setPickedId((id) => (id === res.wordId ? null : id));

  const flip = () => {
    if (!card) return;
    interacted.current = true;
    setFlippedFor(card.wordId);
  };
  const rate = (rating: ReviewRating) => {
    if (!card || !flipped || busy) return;
    interacted.current = true;
    submit.mutate({ wordId: card.wordId, rating }, { onSuccess: answered });
  };
  const postponeCard = () => {
    if (!card || !flipped || busy) return;
    interacted.current = true;
    postpone.mutate(card.wordId, { onSuccess: answered });
  };
  const choices = card ? reviewChoices(card) : [];
  const choose = (n: number) => {
    const choice = choices[n - 1];
    if (choice === undefined) return;
    if (choice === 'postpone') postponeCard();
    else rate(choice);
  };
  const skip = () => {
    if (!card) return;
    interacted.current = true;
    if (pickedId !== null) {
      setPickedId(null);
      return;
    }
    setSkipped((ids) => [...ids.filter((id) => id !== card.wordId), card.wordId]);
  };
  const pick = (wordId: number) => {
    interacted.current = true;
    setPickedId(wordId);
  };
  const canSkip = pickedId !== null || queue.length > 1;

  // Keep keyboard focus on the main action as the card flips and advances.
  useEffect(() => {
    if (interacted.current) cardRef.current?.focus();
  }, [card?.wordId, flipped]);

  // Latest handlers for the key listener, so it is bound once per mount.
  const keys = useRef({ flip, choose, skip, card, flipped });
  useEffect(() => {
    keys.current = { flip, choose, skip, card, flipped };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isEditable(target) || target?.closest('[data-card-keys="off"]')) return;
      const k = keys.current;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        // A focused button or link already reacts to Space/Enter natively.
        if (target?.closest('button, a, [role="button"]')) return;
        if (!k.flipped) {
          e.preventDefault();
          k.flip();
        }
        return;
      }
      if (!k.card) return;
      switch (e.key.toLowerCase()) {
        case 'r':
          e.preventDefault();
          playWord(k.card);
          return;
        case 's':
          e.preventDefault();
          playExample(k.card);
          return;
        case 'n':
        case 'arrowright':
          e.preventDefault();
          k.skip();
          return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && k.flipped) {
        e.preventDefault();
        k.choose(n);
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
        <div className={styles.headerEnd}>
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
          <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
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
          ) : pickedId !== null && !card ? (
            pickedCard.isError ? (
              <div className={styles.cardBar}>
                <p role="alert" className={styles.error}>
                  Không tải được thẻ: {pickedCard.error.message}
                </p>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setPickedId(null)}
                >
                  Về thẻ đến hạn
                </button>
              </div>
            ) : (
              <p role="status" className={styles.muted}>
                Đang tải thẻ…
              </p>
            )
          ) : card ? (
            <>
              <Flashcard
                key={card.wordId}
                ref={cardRef}
                card={card}
                flipped={flipped}
                onFlip={flip}
                onRate={rate}
                onPostpone={postponeCard}
                busy={busy}
              />
              {(submit.isError || postpone.isError) && (
                <p role="alert" className={styles.error}>
                  Không lưu được kết quả: {(submit.error ?? postpone.error)?.message}
                </p>
              )}
              <div className={styles.cardBar}>
                <p className={styles.picked}>
                  {pickedId !== null
                    ? 'Đang ôn từ bạn chọn trong sổ từ.'
                    : `Còn ${counts.due} thẻ đến hạn.`}
                </p>
                {canSkip && (
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-keyshortcuts="N ArrowRight"
                    onClick={skip}
                  >
                    {pickedId !== null ? 'Về thẻ đến hạn' : 'Từ khác'} <kbd>N</kbd>
                  </button>
                )}
              </div>
              <p className={styles.hint}>
                Hệ thống lặp lại ngắt quãng: từ càng dễ thì càng lâu mới hỏi lại.
                <br />
                Phím tắt: <kbd>Space</kbd> lật thẻ, <kbd>1</kbd>–<kbd>{choices.length}</kbd> chọn
                mức nhớ, <kbd>?</kbd> xem tất cả.
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
          <WordBook
            currentId={card?.wordId ?? null}
            onPick={pick}
            onRemoved={(wordId) => setPickedId((id) => (id === wordId ? null : id))}
          />
        </div>
      </div>
    </>
  );
}

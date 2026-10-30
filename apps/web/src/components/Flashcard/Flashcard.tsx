/**
 * Review card (mockup Vocab.dc.html): front = word + example, "Xem nghĩa" flips it, then the
 * 4 rating buttons show the real FSRS intervals from the server, with "Mai ôn" (postpone to
 * tomorrow, no rating) between Khó and Nhớ when Nhớ is more than a day away.
 */
import { POSTPONE_LABEL, REVIEW_RATING_LABELS, type ReviewRating } from '@daily-learning/shared';
import type { ReviewCardDto } from '@daily-learning/shared/api';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { posLabel } from '../../lib/labels';
import { SpeakerIcon } from '../Icons';
import styles from './Flashcard.module.css';
import { playExample, playWord, reviewChoices } from './review';

export interface FlashcardProps {
  card: ReviewCardDto;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: ReviewRating) => void;
  /** "Mai ôn": review again tomorrow. */
  onPostpone: () => void;
  /** While the rating is being sent. */
  busy?: boolean;
}

export interface FlashcardHandle {
  /** Focus the main action: "Xem nghĩa" on the front, the rating group on the back. */
  focus: () => void;
}

export const Flashcard = forwardRef<FlashcardHandle, FlashcardProps>(function Flashcard(
  { card, flipped, onFlip, onRate, onPostpone, busy = false },
  ref,
) {
  const choices = reviewChoices(card);
  const flipRef = useRef<HTMLButtonElement>(null);
  const ratingsRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => (flipped ? ratingsRef.current : flipRef.current)?.focus(),
  }));

  return (
    <div className={styles.wrap}>
      <article className={styles.card} aria-label={`Thẻ từ ${card.lemma}`}>
        {card.sourceLesson && (
          <div className={styles.source}>
            Từ bài: <span lang="en">{card.sourceLesson.title}</span>
          </div>
        )}
        <div className={styles.head}>
          <h2 className={styles.word} lang="en">
            {card.lemma}
          </h2>
          <button
            type="button"
            className={styles.speaker}
            aria-label={
              card.audioUrl
                ? `Nghe phát âm ${card.lemma}`
                : `Nghe phát âm ${card.lemma} (chưa có audio)`
            }
            title={card.audioUrl ? undefined : 'Chưa có audio: chạy npm run content:tts-words'}
            disabled={!card.audioUrl}
            onClick={() => playWord(card)}
          >
            <SpeakerIcon />
          </button>
        </div>
        {card.example && (
          <div className={styles.exampleRow}>
            <p className={styles.example} lang="en">
              “{card.example}”
            </p>
            {card.exampleAudio && (
              <button
                type="button"
                className={styles.speaker}
                aria-label="Nghe câu ví dụ"
                title="Nghe câu ví dụ trong bài"
                onClick={() => playExample(card)}
              >
                <SpeakerIcon />
              </button>
            )}
          </div>
        )}
        {flipped && (
          <div className={styles.back} aria-live="polite">
            <div className={styles.meta}>
              <span lang="en">{card.ipaUs}</span>
              {card.pos && (
                <>
                  {' · '}
                  <span className={styles.pos}>{posLabel(card.pos)}</span>
                </>
              )}
            </div>
            <div className={styles.meaning}>{card.meaningVi}</div>
          </div>
        )}
      </article>

      {flipped ? (
        <div
          ref={ratingsRef}
          role="group"
          aria-label="Bạn nhớ từ này thế nào?"
          className={styles.ratings}
          data-count={choices.length}
          tabIndex={-1}
        >
          {choices.map((choice, i) => {
            const key = String(i + 1);
            if (choice === 'postpone')
              return (
                <button
                  key={choice}
                  type="button"
                  className={styles.rate}
                  data-rating="postpone"
                  disabled={busy}
                  aria-keyshortcuts={key}
                  aria-label={`${POSTPONE_LABEL}: ôn lại vào ngày mai (phím ${key})`}
                  onClick={onPostpone}
                >
                  <span className={styles.rateLabel}>{POSTPONE_LABEL}</span>
                  <span className={styles.rateNext}>ngày mai</span>
                </button>
              );
            const p = card.previews.find((x) => x.rating === choice);
            if (!p) return null;
            return (
              <button
                key={choice}
                type="button"
                className={styles.rate}
                data-rating={choice}
                disabled={busy}
                aria-keyshortcuts={key}
                aria-label={`${REVIEW_RATING_LABELS[choice]}: hỏi lại sau ${p.interval} (phím ${key})`}
                onClick={() => onRate(choice)}
              >
                <span className={styles.rateLabel}>{REVIEW_RATING_LABELS[choice]}</span>
                <span className={styles.rateNext}>{p.interval}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          ref={flipRef}
          type="button"
          className={styles.flip}
          aria-keyshortcuts="Space Enter"
          onClick={onFlip}
        >
          Xem nghĩa
        </button>
      )}
    </div>
  );
});

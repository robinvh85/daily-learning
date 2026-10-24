/**
 * Review card (mockup Vocab.dc.html): front = word + example, "Xem nghĩa" flips it, then the
 * 4 rating buttons show the real FSRS intervals from the server.
 */
import { REVIEW_RATING_LABELS, type ReviewRating } from '@daily-learning/shared';
import type { ReviewCardDto } from '@daily-learning/shared/api';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { posLabel } from '../../lib/labels';
import { playUrl } from '../../lib/playUrl';
import { SpeakerIcon } from '../Icons';
import styles from './Flashcard.module.css';

export interface FlashcardProps {
  card: ReviewCardDto;
  flipped: boolean;
  onFlip: () => void;
  onRate: (rating: ReviewRating) => void;
  /** While the rating is being sent. */
  busy?: boolean;
}

export interface FlashcardHandle {
  /** Focus the main action: "Xem nghĩa" on the front, the rating group on the back. */
  focus: () => void;
}

export const Flashcard = forwardRef<FlashcardHandle, FlashcardProps>(function Flashcard(
  { card, flipped, onFlip, onRate, busy = false },
  ref,
) {
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
            onClick={() => card.audioUrl && playUrl(card.audioUrl)}
          >
            <SpeakerIcon />
          </button>
        </div>
        {card.example && (
          <p className={styles.example} lang="en">
            “{card.example}”
          </p>
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
          tabIndex={-1}
        >
          {card.previews.map((p) => (
            <button
              key={p.rating}
              type="button"
              className={styles.rate}
              data-rating={p.rating}
              disabled={busy}
              aria-keyshortcuts={String(p.rating)}
              aria-label={`${REVIEW_RATING_LABELS[p.rating]}: hỏi lại sau ${p.interval} (phím ${p.rating})`}
              onClick={() => onRate(p.rating)}
            >
              <span className={styles.rateLabel}>{REVIEW_RATING_LABELS[p.rating]}</span>
              <span className={styles.rateNext}>{p.interval}</span>
            </button>
          ))}
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

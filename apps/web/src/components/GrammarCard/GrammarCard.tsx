/** Grammar card (grammar plan 3.2): the grammar point of an underlined part of a lesson sentence. */
import type { LessonGrammarPointDto } from '@daily-learning/shared/api';
import { Link } from 'react-router-dom';
import { grammarHref } from '../../lib/labels';
import styles from './GrammarCard.module.css';

export interface GrammarCardProps {
  point: LessonGrammarPointDto;
  /** The underlined words, as written in the sentence. */
  quote: string;
  notes: readonly string[];
  onClose: () => void;
}

export function GrammarCard({ point, quote, notes, onClose }: GrammarCardProps) {
  return (
    <section className={styles.card} aria-labelledby="grammar-card-title" aria-live="polite">
      <div className={styles.head}>
        <p className={styles.eyebrow}>Ngữ pháp trong bài</p>
        <button type="button" className={styles.close} aria-label="Đóng" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 id="grammar-card-title" className={styles.title}>
        {point.title}
      </h2>
      <p className={styles.titleEn} lang="en">
        {point.titleEn}
      </p>
      <p className={styles.quote} lang="en">
        “{quote}”
      </p>
      {point.pattern && (
        <p className={styles.pattern} lang="en">
          {point.pattern}
        </p>
      )}
      {notes.length > 0 ? (
        notes.map((n) => (
          <p key={n} className={styles.note}>
            {n}
          </p>
        ))
      ) : (
        <p className={styles.note}>{point.summary}</p>
      )}
      <Link className={styles.link} to={grammarHref(point.slug)}>
        Học điểm này
      </Link>
    </section>
  );
}

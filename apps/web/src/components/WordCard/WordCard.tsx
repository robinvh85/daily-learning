import type { WordDto } from '@daily-learning/shared/api';
import { cambridgeUrl, posLabel } from '../../lib/labels';
import { playUrl } from '../../lib/playUrl';
import { ExternalIcon, SpeakerIcon } from '../Icons';
import styles from './WordCard.module.css';

export interface WordCardProps {
  word: WordDto | null;
  /** Sense used in the lesson context; falls back to the first sense. */
  senseId?: number | null;
  /** Form that appears in the text (`opened`), when it differs from the lemma. */
  surface?: string | null;
  saved?: boolean;
  saving?: boolean;
  onToggleSave?: () => void;
  /** Shows a close button (listening page). */
  onClose?: () => void;
}

export function WordCard({
  word,
  senseId,
  surface,
  saved = false,
  saving = false,
  onToggleSave,
  onClose,
}: WordCardProps) {
  if (!word) {
    return (
      <section aria-label="Từ đang chọn" className={styles.card}>
        <div className={styles.eyebrow}>Từ đang chọn</div>
        <p className={styles.empty}>Bấm vào một từ trong bài để xem nghĩa.</p>
      </section>
    );
  }
  const sense = word.senses.find((s) => s.id === senseId) ?? word.senses[0];
  const showSurface = surface && surface.toLowerCase() !== word.lemma.toLowerCase();

  return (
    <section aria-label="Từ đang chọn" className={styles.card} aria-live="polite">
      <div className={styles.eyebrowRow}>
        <div className={styles.eyebrow}>Từ đang chọn</div>
        <div className={styles.eyebrowTools}>
          {word.status === 'draft' && (
            <span className={styles.draft} title="Nghĩa đang chờ duyệt">
              bản nháp
            </span>
          )}
          {onClose && (
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Đóng thẻ từ"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className={styles.head}>
        <h2 className={styles.lemma} lang="en">
          {word.lemma}
        </h2>
        {word.audioUrl ? (
          <button
            type="button"
            className={styles.speaker}
            aria-label={`Nghe phát âm ${word.lemma}`}
            onClick={() => playUrl(word.audioUrl!)}
          >
            <SpeakerIcon />
          </button>
        ) : (
          <button
            type="button"
            className={styles.speaker}
            aria-label={`Nghe phát âm ${word.lemma} (chưa có audio)`}
            title="Chưa có audio: chạy npm run content:tts-words"
            disabled
          >
            <SpeakerIcon />
          </button>
        )}
      </div>
      {showSurface && (
        <div className={styles.surface}>
          Trong bài: <span lang="en">{surface}</span>
        </div>
      )}
      <div className={styles.meta}>
        <span lang="en">{word.ipaUs}</span>
        {sense && (
          <>
            {' · '}
            <span className={styles.pos}>{posLabel(sense.pos)}</span>
          </>
        )}
      </div>
      {sense && (
        <>
          <div className={styles.meaning}>{sense.meaningVi}</div>
          <blockquote className={styles.example} lang="en">
            “{sense.example}”
          </blockquote>
          {sense.collocations.length > 0 && (
            <div className={styles.collocations}>
              <span className={styles.label}>Hay đi với:</span>{' '}
              <span lang="en">{sense.collocations.join(', ')}</span>
            </div>
          )}
        </>
      )}
      <a
        className={styles.external}
        href={cambridgeUrl(word.lemma)}
        target="_blank"
        rel="noreferrer"
      >
        Tra Cambridge (US)
        <ExternalIcon />
        <span className="visually-hidden"> (mở thẻ mới)</span>
      </a>
      {onToggleSave && (
        <button
          type="button"
          className={saved ? `${styles.save} ${styles.saved}` : styles.save}
          aria-pressed={saved}
          disabled={saving}
          onClick={onToggleSave}
        >
          {saved ? 'Đã lưu vào sổ từ' : 'Lưu vào sổ từ để ôn'}
        </button>
      )}
    </section>
  );
}

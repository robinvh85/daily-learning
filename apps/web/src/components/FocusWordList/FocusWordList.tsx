import type { FocusWordDto, WordDto } from '@daily-learning/shared/api';
import styles from './FocusWordList.module.css';

export interface FocusWordListProps {
  focusWords: readonly FocusWordDto[];
  words: Readonly<Record<string, WordDto>>;
  selectedWordId: number | null;
  savedWordIds?: ReadonlySet<number>;
  onSelect: (f: FocusWordDto) => void;
}

export function FocusWordList({
  focusWords,
  words,
  selectedWordId,
  savedWordIds,
  onSelect,
}: FocusWordListProps) {
  return (
    <section aria-labelledby="focus-words-title" className={styles.card}>
      <h2 id="focus-words-title" className={styles.title}>
        Từ mới trong bài ({focusWords.length})
      </h2>
      <ul className={styles.list}>
        {focusWords.map((f) => {
          const w = words[f.wordId];
          if (!w) return null;
          const sense = w.senses.find((s) => s.id === f.senseId) ?? w.senses[0];
          const selected = f.wordId === selectedWordId;
          const saved = savedWordIds?.has(f.wordId) ?? false;
          return (
            <li key={f.wordId}>
              <button
                type="button"
                className={selected ? `${styles.item} ${styles.selected}` : styles.item}
                aria-pressed={selected}
                onClick={() => onSelect(f)}
              >
                <span className={styles.word} lang="en">
                  {w.lemma}
                  {saved && (
                    <span className={styles.savedDot} title="Đã lưu">
                      <span className="visually-hidden"> (đã lưu)</span>
                    </span>
                  )}
                </span>
                <span className={styles.meaning}>{sense?.meaningVi}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

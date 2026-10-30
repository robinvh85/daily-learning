/**
 * "Sổ từ của tôi": saved words filtered by source and status, with remove + confirm. Clicking a
 * word puts it on the review card, due or not.
 */
import {
  VOCAB_STATUS_LABELS,
  VOCAB_STATUSES,
  type VocabSource,
  type VocabStatus,
} from '@daily-learning/shared';
import { useState } from 'react';
import { useRemoveWord, useVocabList } from '../../api/hooks';
import styles from './VocabPage.module.css';

const SOURCES: { value: VocabSource | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'read', label: 'Từ bài đọc' },
  { value: 'listen', label: 'Từ bài nghe' },
];

export interface WordBookProps {
  /** The word on the review card, highlighted in the list. */
  currentId: number | null;
  /** Review this word now. */
  onPick: (wordId: number) => void;
  onRemoved: (wordId: number) => void;
}

export function WordBook({ currentId, onPick, onRemoved }: WordBookProps) {
  const [source, setSource] = useState<VocabSource | 'all'>('all');
  const [status, setStatus] = useState<VocabStatus | 'all'>('all');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const list = useVocabList({ source, status });
  const remove = useRemoveWord();

  return (
    <aside className={styles.book} aria-labelledby="word-book-title">
      <h2 id="word-book-title" className={styles.h2}>
        Sổ từ của tôi
      </h2>
      <div role="group" aria-label="Lọc theo nguồn" className={styles.chips}>
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={styles.chip}
            aria-pressed={source === s.value}
            onClick={() => setSource(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Lọc theo trạng thái" className={styles.chips}>
        {VOCAB_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.chip}
            data-status={s}
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? 'all' : s)}
          >
            {VOCAB_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <p role="status" className={styles.muted}>
          Đang tải…
        </p>
      ) : list.isError ? (
        <p role="alert" className={styles.error}>
          Không tải được sổ từ: {list.error.message}
        </p>
      ) : list.data.items.length === 0 ? (
        <p className={styles.muted}>
          {source === 'all' && status === 'all'
            ? 'Chưa có từ nào. Bấm "Lưu vào sổ từ để ôn" khi đọc hoặc nghe bài.'
            : 'Không có từ nào khớp bộ lọc.'}
        </p>
      ) : (
        <ul className={styles.rows} aria-label="Danh sách từ đã lưu">
          {list.data.items.map((it) => (
            <li
              key={it.wordId}
              className={styles.row}
              aria-current={currentId === it.wordId ? 'true' : undefined}
            >
              <button
                type="button"
                className={styles.rowText}
                aria-label={`Ôn từ ${it.lemma}: ${it.meaningVi}`}
                onClick={() => onPick(it.wordId)}
              >
                <span className={styles.rowWord} lang="en">
                  {it.lemma}
                </span>
                <span className={styles.rowMeaning}>{it.meaningVi}</span>
              </button>
              {confirmId === it.wordId ? (
                <div className={styles.confirm} role="group" aria-label={`Xóa ${it.lemma}?`}>
                  <span className={styles.confirmText}>Xóa?</span>
                  <button
                    type="button"
                    className={styles.danger}
                    aria-label={`Xóa ${it.lemma} khỏi sổ từ`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(it.wordId, {
                        onSuccess: () => onRemoved(it.wordId),
                        onSettled: () => setConfirmId(null),
                      })
                    }
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    // Keep keyboard users in place: focus the safe choice.
                    autoFocus
                    onClick={() => setConfirmId(null)}
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <div className={styles.rowEnd}>
                  <span className={styles.badge} data-status={it.status}>
                    {VOCAB_STATUS_LABELS[it.status]}
                  </span>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Xóa ${it.lemma} khỏi sổ từ`}
                    onClick={() => setConfirmId(it.wordId)}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && (
        <p role="alert" className={styles.error}>
          Không xóa được: {remove.error.message}
        </p>
      )}
    </aside>
  );
}

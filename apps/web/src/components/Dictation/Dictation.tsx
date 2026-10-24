/**
 * "Nghe chép": fill the missing word of a few segments. Answers are graded on the server
 * (case-insensitive, punctuation ignored); a wrong answer shows the expected word.
 */
import type { AnswerResponse, DictationItemDto } from '@daily-learning/shared/api';
import { useState } from 'react';
import { useSubmitAnswer } from '../../api/hooks';
import { SpeakerIcon } from '../Icons';
import styles from './Dictation.module.css';

export interface DictationProps {
  slug: string;
  items: readonly DictationItemDto[];
  /** Play only the segment of an item; omitted when the lesson has no audio timings. */
  onPlayItem?: (item: DictationItemDto) => void;
  /** Called after each "Kiểm tra" with the number of right answers. */
  onChecked?: (right: number, total: number) => void;
}

export function Dictation({ slug, items, onPlayItem, onChecked }: DictationProps) {
  const submit = useSubmitAnswer(slug);
  const [values, setValues] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, AnswerResponse>>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const graded = await Promise.all(
        items.map(async (item) => {
          const value = (values[item.id] ?? '').trim();
          const res = await submit.mutateAsync({ dictationItemId: item.id, value });
          return [item.id, res] as const;
        }),
      );
      const next = Object.fromEntries(graded);
      setResults(next);
      onChecked?.(graded.filter(([, r]) => r.correct).length, items.length);
    } catch (err) {
      setError(`Không chấm được bài: ${(err as Error).message}`);
    } finally {
      setChecking(false);
    }
  }

  const checked = items.length > 0 && items.every((i) => results[i.id]);
  const right = items.filter((i) => results[i.id]?.correct).length;

  return (
    <div className={styles.dictation}>
      <p className={styles.hint}>Nghe từng câu, điền từ còn thiếu. Bấm “Câu sau” để chuyển câu.</p>
      {items.map((item) => {
        const id = `dict-${item.id}`;
        const r = results[item.id];
        const state = r ? (r.correct ? styles.right : styles.wrong) : '';
        return (
          <div key={item.id} className={styles.item}>
            <div className={styles.labelRow}>
              <label htmlFor={id} className={styles.label} lang="en">
                {item.beforeText} ____ {item.afterText}
              </label>
              {onPlayItem && (
                <button
                  type="button"
                  className={styles.playItem}
                  onClick={() => onPlayItem(item)}
                  aria-label={`Nghe câu này (câu ${item.idx + 1})`}
                >
                  <SpeakerIcon size={18} />
                  <span aria-hidden="true">Nghe câu này</span>
                </button>
              )}
            </div>
            <input
              id={id}
              type="text"
              lang="en"
              className={`${styles.input} ${state}`}
              value={values[item.id] ?? ''}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Gõ từ bạn nghe được"
              aria-invalid={r ? !r.correct : undefined}
              aria-describedby={r && !r.correct ? `${id}-answer` : undefined}
              onChange={(e) => {
                const v = e.target.value;
                setValues((prev) => ({ ...prev, [item.id]: v }));
                setResults((prev) => {
                  const rest = { ...prev };
                  delete rest[item.id];
                  return rest;
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void check();
              }}
            />
            {r && !r.correct && (
              <div id={`${id}-answer`} className={styles.answer}>
                Đáp án: <span lang="en">{r.expected}</span>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.check}
        onClick={() => void check()}
        disabled={checking}
      >
        {checking ? 'Đang chấm…' : 'Kiểm tra'}
      </button>
      <div className={styles.score} role="status">
        {checked &&
          `Đúng ${right}/${items.length}${
            right === items.length ? ' — tốt lắm!' : ' — nghe lại câu sai với tốc độ 0.75×'
          }`}
      </div>
    </div>
  );
}

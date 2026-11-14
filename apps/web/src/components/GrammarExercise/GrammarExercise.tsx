/**
 * One grammar exercise (grammar plan 3.3, step "Luyện tập"): choice, gap, word order or find the
 * mistake. One attempt per exercise: the answer is checked by the backend and the result shown
 * with the explanation.
 */
import type { GrammarExerciseDto } from '@daily-learning/shared/api';
import { useState, type FormEvent, type ReactNode } from 'react';
import styles from './GrammarExercise.module.css';

export interface ExerciseResult {
  correct: boolean;
  expected: string;
  explain: string;
  /** What the learner answered, as shown. */
  given: string;
}

export interface GrammarExerciseProps {
  exercise: GrammarExerciseDto;
  /** 1-based number shown before the prompt. */
  n: number;
  result: ExerciseResult | null;
  pending: boolean;
  onSubmit: (value: number | string, correction?: string) => void;
}

const INSTRUCTIONS: Record<GrammarExerciseDto['type'], string> = {
  choice: 'Chọn đáp án đúng',
  gap: 'Điền dạng đúng của từ trong ngoặc',
  order: 'Sắp xếp các từ thành câu',
  find_error: 'Bấm vào chỗ sai rồi sửa lại',
};

export function GrammarExercise({ exercise, n, result, pending, onSubmit }: GrammarExerciseProps) {
  const locked = result !== null || pending;
  return (
    <fieldset className={styles.exercise} aria-busy={pending} data-testid={`exercise-${n}`}>
      <legend className={styles.legend}>
        <span className={styles.n}>{n}.</span> {INSTRUCTIONS[exercise.type]}
      </legend>
      {exercise.type === 'choice' && (
        <Choice exercise={exercise} result={result} locked={locked} onSubmit={onSubmit} />
      )}
      {exercise.type === 'gap' && (
        <Gap prompt={exercise.prompt} locked={locked} onSubmit={onSubmit} />
      )}
      {exercise.type === 'order' && (
        <Order words={exercise.words} locked={locked} onSubmit={onSubmit} />
      )}
      {exercise.type === 'find_error' && (
        <FindError sentence={exercise.sentence} locked={locked} onSubmit={onSubmit} />
      )}
      {result && (
        <div className={result.correct ? styles.ok : styles.wrong} role="status">
          <p className={styles.verdict}>
            {result.correct ? 'Đúng.' : 'Chưa đúng.'}
            {!result.correct && (
              <>
                {' '}
                Đáp án: <strong lang="en">{result.expected}</strong>
              </>
            )}
          </p>
          <p className={styles.explain}>{result.explain}</p>
        </div>
      )}
    </fieldset>
  );
}

/** Prompt text with the `___` blank replaced by `blank`. */
function withBlank(prompt: string, blank: ReactNode) {
  const at = prompt.indexOf('___');
  if (at < 0) return prompt;
  return (
    <>
      {prompt.slice(0, at)}
      {blank}
      {prompt.slice(at + 3)}
    </>
  );
}

function Choice({
  exercise,
  result,
  locked,
  onSubmit,
}: {
  exercise: Extract<GrammarExerciseDto, { type: 'choice' }>;
  result: ExerciseResult | null;
  locked: boolean;
  onSubmit: GrammarExerciseProps['onSubmit'];
}) {
  return (
    <>
      <p className={styles.prompt} lang="en">
        {withBlank(exercise.prompt, <span className={styles.blank}>____</span>)}
      </p>
      <div className={styles.options}>
        {exercise.options.map((label, i) => {
          const chosen = result?.given === label;
          const state = chosen ? (result.correct ? styles.right : styles.bad) : '';
          return (
            <button
              key={label}
              type="button"
              lang="en"
              className={`${styles.option} ${state}`}
              aria-pressed={chosen}
              disabled={locked}
              onClick={() => onSubmit(i)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Gap({
  prompt,
  locked,
  onSubmit,
}: {
  prompt: string;
  locked: boolean;
  onSubmit: GrammarExerciseProps['onSubmit'];
}) {
  const [value, setValue] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }
  return (
    <form className={styles.row} onSubmit={submit}>
      <p className={styles.prompt} lang="en">
        {withBlank(
          prompt,
          <input
            className={styles.input}
            value={value}
            aria-label="Câu trả lời"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={locked}
            onChange={(e) => setValue(e.target.value)}
          />,
        )}
      </p>
      <button type="submit" className={styles.check} disabled={locked || !value.trim()}>
        Kiểm tra
      </button>
    </form>
  );
}

function Order({
  words,
  locked,
  onSubmit,
}: {
  words: readonly string[];
  locked: boolean;
  onSubmit: GrammarExerciseProps['onSubmit'];
}) {
  /** Indexes into `words`, in the order picked. */
  const [picked, setPicked] = useState<number[]>([]);
  const left = words.map((w, i) => ({ w, i })).filter(({ i }) => !picked.includes(i));
  const sentence = picked.map((i) => words[i]).join(' ');
  return (
    <div className={styles.orderBox}>
      <div className={styles.answerLine} aria-label="Câu của bạn" lang="en">
        {picked.length === 0 && <span className={styles.placeholder}>Bấm các từ bên dưới</span>}
        {picked.map((i, at) => (
          <button
            key={i}
            type="button"
            className={styles.chipPicked}
            disabled={locked}
            aria-label={`Bỏ "${words[i]}"`}
            onClick={() => setPicked((p) => p.filter((_, k) => k !== at))}
          >
            {words[i]}
          </button>
        ))}
      </div>
      <div className={styles.bank} lang="en">
        {left.map(({ w, i }) => (
          <button
            key={i}
            type="button"
            className={styles.chip}
            disabled={locked}
            onClick={() => setPicked((p) => [...p, i])}
          >
            {w}
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={locked || picked.length === 0}
          onClick={() => setPicked([])}
        >
          Xếp lại
        </button>
        <button
          type="button"
          className={styles.check}
          disabled={locked || left.length > 0}
          onClick={() => onSubmit(sentence)}
        >
          Kiểm tra
        </button>
      </div>
    </div>
  );
}

/** Words of a sentence with their offsets (punctuation stays attached to the word). */
function splitSentence(sentence: string): { text: string; start: number; end: number }[] {
  return [...sentence.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

const stripPunct = (s: string) => s.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

function FindError({
  sentence,
  locked,
  onSubmit,
}: {
  sentence: string;
  locked: boolean;
  onSubmit: GrammarExerciseProps['onSubmit'];
}) {
  const words = splitSentence(sentence);
  /** Picked word range [from, to] (inclusive), contiguous. */
  const [range, setRange] = useState<[number, number] | null>(null);
  const [correction, setCorrection] = useState('');

  function pick(i: number) {
    setRange((r) => {
      if (!r) return [i, i];
      const [a, b] = r;
      if (i === a - 1) return [i, b];
      if (i === b + 1) return [a, i];
      if (a === b && i === a) return null;
      if (i === a) return [a + 1, b];
      if (i === b) return [a, b - 1];
      return [i, i];
    });
  }
  const picked = range
    ? stripPunct(sentence.slice(words[range[0]]!.start, words[range[1]]!.end))
    : '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (picked && correction.trim()) onSubmit(picked, correction.trim());
  }

  return (
    <form className={styles.findBox} onSubmit={submit}>
      <p className={styles.prompt} lang="en">
        {words.map((w, i) => {
          const on = range !== null && i >= range[0] && i <= range[1];
          return (
            <span key={w.start}>
              {i > 0 && ' '}
              <button
                type="button"
                className={on ? `${styles.word} ${styles.wordOn}` : styles.word}
                aria-pressed={on}
                disabled={locked}
                onClick={() => pick(i)}
              >
                {w.text}
              </button>
            </span>
          );
        })}
      </p>
      <div className={styles.row}>
        <label className={styles.fixLabel}>
          {picked ? (
            <>
              Sửa <span lang="en">“{picked}”</span> thành
            </>
          ) : (
            'Chọn chỗ sai trong câu'
          )}
          <input
            className={styles.input}
            lang="en"
            value={correction}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={locked || !picked}
            onChange={(e) => setCorrection(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className={styles.check}
          disabled={locked || !picked || !correction.trim()}
        >
          Kiểm tra
        </button>
      </div>
    </form>
  );
}

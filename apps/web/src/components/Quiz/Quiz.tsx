import type { QuestionDto } from '@daily-learning/shared/api';
import styles from './Quiz.module.css';

export interface QuizAnswer {
  choice: number;
  correct: boolean;
  feedback: string | null;
}

export interface QuizProps {
  questions: readonly QuestionDto[];
  answers: Readonly<Record<number, QuizAnswer>>;
  /** Question id whose answer is being graded. */
  pendingId?: number | null;
  error?: string | null;
  /** Without the separator above (inside a card or tab panel). */
  bare?: boolean;
  onPick: (question: QuestionDto, choice: number) => void;
}

export function Quiz({
  questions,
  answers,
  pendingId = null,
  error = null,
  bare = false,
  onPick,
}: QuizProps) {
  const answered = questions.filter((q) => answers[q.id]);
  const right = answered.filter((q) => answers[q.id]?.correct).length;
  const score =
    answered.length > 0
      ? `Đúng ${right}/${questions.length}`
      : `${questions.length} câu · chọn một đáp án`;

  return (
    <section
      aria-labelledby="quiz-title"
      className={bare ? `${styles.quiz} ${styles.bare}` : styles.quiz}
    >
      <div className={styles.header}>
        <h2 id="quiz-title" className={styles.title}>
          Câu hỏi hiểu bài
        </h2>
        <span className={styles.score} aria-live="polite">
          {score}
        </span>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {questions.map((q, qi) => {
        const a = answers[q.id];
        return (
          <fieldset key={q.id} className={styles.question} aria-busy={pendingId === q.id}>
            <legend className={styles.prompt}>
              {qi + 1}. <span lang="en">{q.prompt}</span>
            </legend>
            <div className={styles.options}>
              {q.options.map((label, oi) => {
                const chosen = a?.choice === oi;
                const state = chosen ? (a.correct ? styles.right : styles.wrong) : '';
                return (
                  <button
                    key={oi}
                    type="button"
                    lang="en"
                    className={`${styles.option} ${state}`}
                    aria-pressed={chosen}
                    disabled={pendingId === q.id}
                    onClick={() => onPick(q, oi)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {a && (
              <div className={a.correct ? styles.feedbackOk : styles.feedbackWrong} role="status">
                {a.feedback ?? (a.correct ? 'Đúng.' : 'Chưa đúng.')}
              </div>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}

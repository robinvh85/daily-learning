import type {
  FocusWordDto,
  LessonDetailResponse,
  QuestionDto,
  SegmentDto,
  TokenDto,
} from '@daily-learning/shared/api';
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError } from '../../api/client';
import {
  useLesson,
  useSavedWords,
  useSubmitAnswer,
  useToggleSavedWord,
  useUpdateProgress,
} from '../../api/hooks';
import { FocusWordList } from '../../components/FocusWordList/FocusWordList';
import { GrammarCard } from '../../components/GrammarCard/GrammarCard';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from '../../components/Icons';
import { Quiz, type QuizAnswer } from '../../components/Quiz/Quiz';
import { TokenizedText } from '../../components/TokenizedText/TokenizedText';
import { WordCard } from '../../components/WordCard/WordCard';
import { timedSegments, useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLessonGrammar } from '../../hooks/useLessonGrammar';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';
import { topicLabel } from '../../lib/labels';
import { readStorage, writeStorage } from '../../lib/storage';
import styles from './ReadingPage.module.css';

export const FONT_SIZE_KEY = 'dl.reading.fontSize';
const FONT_MIN = 16;
const FONT_MAX = 24;
const FONT_DEFAULT = 19;
const STEPS = ['Đọc bài', 'Từ mới', 'Câu hỏi'] as const;

function initialFontSize(): number {
  const n = Number(readStorage(FONT_SIZE_KEY));
  return Number.isInteger(n) && n >= FONT_MIN && n <= FONT_MAX ? n : FONT_DEFAULT;
}

/** Group reading segments into paragraphs (segments without a paragraph stand alone). */
function paragraphs(segments: readonly SegmentDto[]): SegmentDto[][] {
  const out: SegmentDto[][] = [];
  let last: number | null | undefined;
  for (const s of segments) {
    const current = out[out.length - 1];
    if (current && s.paragraphIdx !== null && s.paragraphIdx === last) current.push(s);
    else out.push([s]);
    last = s.paragraphIdx;
  }
  return out;
}

interface Selection {
  wordId: number;
  senseId: number | null;
  surface: string | null;
}

export function ReadingPage() {
  const { slug = '' } = useParams();
  const lesson = useLesson(slug);
  useDocumentTitle(
    lesson.data
      ? `${lesson.data.lesson.title} – Bài đọc`
      : lesson.isError
        ? 'Không tìm thấy bài đọc'
        : 'Bài đọc',
  );

  if (lesson.isPending) {
    return (
      <p className={styles.status} role="status">
        Đang tải bài đọc…
      </p>
    );
  }
  if (lesson.isError) {
    const notFound = lesson.error instanceof ApiRequestError && lesson.error.status === 404;
    return (
      <div className={styles.status} role="alert">
        <p>
          {notFound ? 'Không tìm thấy bài đọc này.' : `Không tải được bài: ${lesson.error.message}`}
        </p>
        <Link to="/">Về trang chủ</Link>
      </div>
    );
  }
  return <ReadingLesson key={slug} slug={slug} data={lesson.data} />;
}

function ReadingLesson({ slug, data }: { slug: string; data: LessonDetailResponse }) {
  const { lesson, segments, words, focusWords, questions } = data;
  const saved = useSavedWords(slug);
  const toggleSave = useToggleSavedWord(slug);
  const submit = useSubmitAnswer(slug);
  const progress = useUpdateProgress(slug);
  // "Nghe bài đọc": narrator audio, current sentence highlighted (plan Phase 3).
  const timed = useMemo(() => timedSegments(segments), [segments]);
  const player = useAudioPlayer(lesson.audioUrl, timed, lesson.durationMs);
  const speakingId =
    timed.length > 0 && (player.playing || player.currentMs > 0)
      ? (timed[player.current]?.id ?? null)
      : null;
  usePlayerShortcuts(player, { enabled: Boolean(lesson.audioUrl), segments: timed.length > 0 });
  const grammar = useLessonGrammar(data);

  const [fontSize, setFontSize] = useState(initialFontSize);
  const [showVi, setShowVi] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(() => {
    const f = focusWords[0];
    return f ? { wordId: f.wordId, senseId: f.senseId, surface: null } : null;
  });
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  // Latest answers for callbacks that finish after a re-render.
  const answersRef = useRef(answers);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [step, setStep] = useState(lesson.progress?.step ?? 0);

  const focusIds = useMemo(() => new Set(focusWords.map((f) => f.wordId)), [focusWords]);
  const savedIds = useMemo(() => new Set(saved.data?.wordIds ?? []), [saved.data]);
  const paras = useMemo(() => paragraphs(segments), [segments]);
  const completed = lesson.progress?.status === 'completed';

  function advance(to: number, extra: { status?: 'completed'; score?: number } = {}) {
    if (to > step) setStep(to);
    if (to > step || extra.status) progress.mutate({ step: Math.max(step, to), ...extra });
  }

  function changeFont(delta: number) {
    setFontSize((fs) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, fs + delta));
      writeStorage(FONT_SIZE_KEY, String(next));
      return next;
    });
  }

  function selectToken(t: TokenDto, s: SegmentDto) {
    if (!grammar.openAt(s, t)) grammar.close();
    setSelection({ wordId: t.wordId, senseId: t.senseId, surface: t.surface });
  }

  function selectFocus(f: FocusWordDto) {
    setSelection({ wordId: f.wordId, senseId: f.senseId, surface: null });
    advance(1);
  }

  function onToggleSave() {
    if (!selection) return;
    const isSaved = savedIds.has(selection.wordId);
    toggleSave.mutate({
      wordId: selection.wordId,
      save: !isSaved,
      senseId: selection.senseId,
      sourceLessonId: lesson.id,
    });
    if (!isSaved) advance(1);
  }

  function onPick(q: QuestionDto, choice: number) {
    setPendingId(q.id);
    setQuizError(null);
    submit.mutate(
      { questionId: q.id, value: choice },
      {
        onSuccess: (res) => {
          const next = { ...answersRef.current, [q.id]: { choice, ...res } };
          answersRef.current = next;
          setAnswers(next);
          const done = questions.filter((x) => next[x.id]);
          if (done.length === questions.length) {
            const right = done.filter((x) => next[x.id]?.correct).length;
            advance(2, { status: 'completed', score: right / questions.length });
          } else {
            advance(2);
          }
        },
        onError: (err) => setQuizError(`Không gửi được câu trả lời: ${err.message}`),
        onSettled: () => setPendingId(null),
      },
    );
  }

  const selectedWord = selection ? (words[selection.wordId] ?? null) : null;

  return (
    <>
      <header className={styles.header}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link to="/">Trang chủ</Link> › <Link to="/read">Đọc</Link> › {lesson.level} › Bài{' '}
          {lesson.orderIndex}
        </nav>
        <div className={styles.headerRow}>
          <ol className={styles.steps} aria-label="Các bước">
            {STEPS.map((label, i) => {
              const state = completed || i < step ? styles.done : i === step ? styles.current : '';
              return (
                <li key={label} className={styles.stepItem}>
                  {i > 0 && (
                    <span className={styles.stepSep} aria-hidden="true">
                      —
                    </span>
                  )}
                  <span
                    className={`${styles.step} ${state}`}
                    aria-current={i === step && !completed ? 'step' : undefined}
                  >
                    {i + 1}. {label}
                    {(completed || i < step) && <span className="visually-hidden"> (xong)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <div role="toolbar" aria-label="Công cụ đọc" className={styles.toolbar}>
            <button
              type="button"
              className={styles.tool}
              aria-label="Giảm cỡ chữ"
              disabled={fontSize <= FONT_MIN}
              onClick={() => changeFont(-1)}
            >
              A−
            </button>
            <button
              type="button"
              className={`${styles.tool} ${styles.toolBig}`}
              aria-label="Tăng cỡ chữ"
              disabled={fontSize >= FONT_MAX}
              onClick={() => changeFont(1)}
            >
              A+
            </button>
            <button
              type="button"
              className={showVi ? `${styles.tool} ${styles.toolOn}` : styles.tool}
              aria-pressed={showVi}
              onClick={() => setShowVi((v) => !v)}
            >
              Song ngữ
            </button>
            {grammar.available && (
              <button
                type="button"
                className={grammar.on ? `${styles.tool} ${styles.toolGrammar}` : styles.tool}
                aria-pressed={grammar.on}
                title={grammar.points.map((p) => p.title).join(', ')}
                onClick={grammar.toggle}
              >
                Ngữ pháp
              </button>
            )}
            {lesson.audioUrl ? (
              <div
                role="group"
                aria-label="Nghe bài đọc"
                className={styles.listenGroup}
                data-player
              >
                {timed.length > 0 && (
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label="Câu trước"
                    title="Câu trước (←)"
                    onClick={player.prev}
                  >
                    <PrevIcon size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.listen}
                  aria-pressed={player.playing}
                  title="Nghe / tạm dừng (Space hoặc P)"
                  onClick={player.toggle}
                >
                  {player.playing ? <PauseIcon size={18} /> : <PlayIcon />}
                  {player.playing ? 'Tạm dừng' : 'Nghe bài đọc'}
                </button>
                {timed.length > 0 && (
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label="Câu sau"
                    title="Câu sau (→)"
                    disabled={player.current >= timed.length - 1}
                    onClick={player.next}
                  >
                    <NextIcon size={18} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={styles.listen}
                aria-disabled="true"
                title={`Chưa có audio: chạy npm run content:tts -- ${slug}`}
                onClick={(e) => e.preventDefault()}
              >
                <PlayIcon />
                Nghe bài đọc
                <span className="visually-hidden"> (chưa có audio)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={styles.columns}>
        <article className={styles.article} aria-labelledby="lesson-title">
          <div className={styles.tags}>
            <span className={styles.tagLevel}>{lesson.level}</span>
            <span className={styles.tag}>{topicLabel(lesson.topic)}</span>
            <span className={styles.tag}>{lesson.wordCount} từ</span>
          </div>
          <h1 id="lesson-title" className={styles.title} lang="en">
            {lesson.title}
          </h1>
          <p className={styles.hint}>
            Bấm vào từ gạch chân để xem nghĩa. Bấm vào từ bất kỳ khác để tra nhanh.
            {grammar.on && grammar.points.length > 0 && (
              <>
                {' '}
                Chữ tím là ví dụ của điểm ngữ pháp{' '}
                <strong>{grammar.points.map((p) => p.title).join(', ')}</strong>.
              </>
            )}
          </p>
          {lesson.audioUrl && (
            <p className={styles.keysHint}>
              Phím tắt: <kbd>Space</kbd> / <kbd>P</kbd> nghe / tạm dừng
              {timed.length > 0 && (
                <>
                  {' · '}
                  <kbd>←</kbd> câu trước · <kbd>→</kbd> câu sau
                </>
              )}
            </p>
          )}
          <div
            className={styles.text}
            style={{ fontSize: `${fontSize}px` }}
            data-testid="reading-text"
          >
            {paras.map((p) => {
              const vi = p
                .map((s) => s.textVi)
                .filter(Boolean)
                .join(' ');
              return (
                <div key={p[0]!.id} className={styles.paragraphBlock}>
                  <p className={styles.paragraph} lang="en">
                    {p.map((s, i) => (
                      <span
                        key={s.id}
                        className={s.id === speakingId ? styles.speaking : undefined}
                        aria-current={s.id === speakingId ? 'true' : undefined}
                        data-testid={`sentence-${s.key}`}
                      >
                        {i > 0 && ' '}
                        <TokenizedText
                          text={s.textEn}
                          tokens={s.tokens}
                          focusWordIds={focusIds}
                          selectedWordId={selection?.wordId ?? null}
                          grammarRanges={grammar.ranges.get(s.id)}
                          onSelect={(t) => selectToken(t, s)}
                        />
                      </span>
                    ))}
                  </p>
                  {showVi && vi && <p className={styles.translation}>{vi}</p>}
                </div>
              );
            })}
          </div>

          {questions.length > 0 && (
            <Quiz
              questions={questions}
              answers={answers}
              pendingId={pendingId}
              error={quizError}
              onPick={onPick}
            />
          )}
        </article>

        <aside className={styles.aside} aria-label="Từ vựng">
          {grammar.open && (
            <GrammarCard
              point={grammar.open.point}
              quote={grammar.open.quote}
              notes={grammar.open.mark.notes}
              onClose={grammar.close}
            />
          )}
          <WordCard
            word={selectedWord}
            senseId={selection?.senseId}
            surface={selection?.surface}
            saved={selection ? savedIds.has(selection.wordId) : false}
            saving={toggleSave.isPending}
            onToggleSave={onToggleSave}
          />
          {toggleSave.isError && (
            <p role="alert" className={styles.saveError}>
              Không lưu được từ: {toggleSave.error.message}
            </p>
          )}
          {focusWords.length > 0 && (
            <FocusWordList
              focusWords={focusWords}
              words={words}
              selectedWordId={selection?.wordId ?? null}
              savedWordIds={savedIds}
              onSelect={selectFocus}
            />
          )}
        </aside>
      </div>
    </>
  );
}

/**
 * Listening lesson (mockup: Listening.dc.html): player with waveform, hidden-by-default
 * transcript (tokenized: every word opens the WordCard), and the "Nghe chép" / "Nghe hiểu" tabs.
 * Without audio the page still works and shows how to generate it.
 */
import type {
  DictationItemDto,
  LessonDetailResponse,
  QuestionDto,
  SegmentDto,
  TokenDto,
} from '@daily-learning/shared/api';
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiRequestError } from '../../api/client';
import {
  useLesson,
  useSavedWords,
  useSubmitAnswer,
  useToggleSavedWord,
  useUpdateProgress,
} from '../../api/hooks';
import { AudioPlayer } from '../../components/AudioPlayer/AudioPlayer';
import { Dictation } from '../../components/Dictation/Dictation';
import { Quiz, type QuizAnswer } from '../../components/Quiz/Quiz';
import { TokenizedText } from '../../components/TokenizedText/TokenizedText';
import { WordCard } from '../../components/WordCard/WordCard';
import { timedSegments, useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';
import { formatTime } from '../../lib/time';
import styles from './ListeningPage.module.css';

type Tab = 'dictation' | 'quiz';

interface Selection {
  wordId: number;
  senseId: number | null;
  surface: string;
}

export function ListeningPage() {
  const { slug = '' } = useParams();
  const lesson = useLesson(slug);
  useDocumentTitle(
    lesson.data
      ? `${lesson.data.lesson.title} – Bài nghe`
      : lesson.isError
        ? 'Không tìm thấy bài nghe'
        : 'Bài nghe',
  );

  if (lesson.isPending) {
    return (
      <p className={styles.status} role="status">
        Đang tải bài nghe…
      </p>
    );
  }
  if (lesson.isError) {
    const notFound = lesson.error instanceof ApiRequestError && lesson.error.status === 404;
    return (
      <div className={styles.status} role="alert">
        <p>
          {notFound
            ? 'Không tìm thấy bài nghe này.'
            : `Không tải được bài: ${lesson.error.message}`}
        </p>
        <Link to="/">Về trang chủ</Link>
      </div>
    );
  }
  return <ListeningLesson key={slug} slug={slug} data={lesson.data} />;
}

function ListeningLesson({ slug, data }: { slug: string; data: LessonDetailResponse }) {
  const { lesson, segments, words, focusWords, questions, dictation, peaks } = data;
  const timed = useMemo(() => timedSegments(segments), [segments]);
  const player = useAudioPlayer(lesson.audioUrl, timed, lesson.durationMs);
  const saved = useSavedWords(slug);
  const toggleSave = useToggleSavedWord(slug);
  const submit = useSubmitAnswer(slug);
  const progress = useUpdateProgress(slug);

  const [showTranscript, setShowTranscript] = useState(false);
  const [showVi, setShowVi] = useState(false);
  const [tab, setTab] = useState<Tab>(dictation.length > 0 ? 'dictation' : 'quiz');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const answersRef = useRef(answers);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const dictScoreRef = useRef<{ right: number; total: number } | null>(
    dictation.length === 0 ? { right: 0, total: 0 } : null,
  );
  const stepRef = useRef(lesson.progress?.step ?? 0);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ dictation: null, quiz: null });

  const focusIds = useMemo(() => new Set(focusWords.map((f) => f.wordId)), [focusWords]);
  const savedIds = useMemo(() => new Set(saved.data?.wordIds ?? []), [saved.data]);
  const hasAudio = lesson.audioUrl !== null;
  const hasTimings = hasAudio && timed.length > 0;
  usePlayerShortcuts(player, { enabled: hasAudio, segments: hasTimings });
  const segIndex = useMemo(() => new Map(segments.map((s, i) => [s.id, i])), [segments]);
  const playingIdx = hasTimings && (player.playing || player.currentMs > 0) ? player.current : -1;

  /** Steps: 0 listen, 1 dictation checked, 2 comprehension answered → completed. */
  function report() {
    const quizDone = questions.every((q) => answersRef.current[q.id]);
    const dict = dictScoreRef.current;
    const step = dict ? (quizDone ? 2 : 1) : quizDone ? 2 : 0;
    if (dict && quizDone) {
      const quizRight = questions.filter((q) => answersRef.current[q.id]?.correct).length;
      const total = dict.total + questions.length;
      progress.mutate({
        step: 2,
        status: 'completed',
        score: total > 0 ? (dict.right + quizRight) / total : null,
      });
      stepRef.current = 2;
    } else if (step > stepRef.current) {
      progress.mutate({ step });
      stepRef.current = step;
    }
  }

  function onDictationChecked(right: number, total: number) {
    dictScoreRef.current = { right, total };
    report();
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
          report();
        },
        onError: (err) => setQuizError(`Không gửi được câu trả lời: ${err.message}`),
        onSettled: () => setPendingId(null),
      },
    );
  }

  function selectToken(t: TokenDto) {
    setSelection({ wordId: t.wordId, senseId: t.senseId, surface: t.surface });
  }

  function onToggleSave() {
    if (!selection) return;
    toggleSave.mutate({
      wordId: selection.wordId,
      save: !savedIds.has(selection.wordId),
      senseId: selection.senseId,
      sourceLessonId: lesson.id,
    });
  }

  function onRowClick(e: MouseEvent<HTMLLIElement>, index: number) {
    // Word buttons open the WordCard; the time button handles itself.
    if ((e.target as HTMLElement).closest('button')) return;
    if (hasTimings) player.seekSegment(index);
  }

  function playItem(item: DictationItemDto) {
    const i = segIndex.get(item.segmentId);
    if (i !== undefined) player.playSegment(i);
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: Tab = tab === 'dictation' ? 'quiz' : 'dictation';
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const selectedWord = selection ? (words[selection.wordId] ?? null) : null;

  return (
    <>
      <header className={styles.header}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link to="/">Trang chủ</Link> › <Link to="/listen">Nghe</Link> › {lesson.level} › Bài{' '}
          {lesson.orderIndex}
        </nav>
        <div className={styles.titleRow}>
          <h1 className={styles.title} lang="en">
            {lesson.title}
          </h1>
          <span className={styles.badgeLevel}>{lesson.level}</span>
          <span className={styles.badge}>Hội thoại · giọng Anh-Mỹ</span>
        </div>
      </header>

      {hasAudio ? (
        <AudioPlayer player={player} peaks={peaks} hasSegments={hasTimings} />
      ) : (
        <section className={styles.noAudio} aria-labelledby="no-audio-title">
          <h2 id="no-audio-title" className={styles.noAudioTitle}>
            Bài này chưa có audio
          </h2>
          <p className={styles.muted}>
            Lời thoại và bài tập vẫn dùng được. Để tạo audio, chạy trên máy (cần ffmpeg và
            GOOGLE_TTS_API_KEY trong <code>.env</code>):
          </p>
          <pre className={styles.command}>
            <code>
              npm run content:tts -- {slug}
              {'\n'}npm run content:build
            </code>
          </pre>
        </section>
      )}

      <div className={styles.columns}>
        <section aria-labelledby="transcript-title" className={styles.transcript}>
          <div className={styles.cardHeader}>
            <h2 id="transcript-title" className={styles.h2}>
              Lời thoại
            </h2>
            <div className={styles.cardTools}>
              {showTranscript && (
                <button
                  type="button"
                  className={showVi ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
                  aria-pressed={showVi}
                  onClick={() => setShowVi((v) => !v)}
                >
                  Song ngữ
                </button>
              )}
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={showTranscript}
                aria-controls="transcript-lines"
                onClick={() => setShowTranscript((v) => !v)}
              >
                {showTranscript ? 'Ẩn lời thoại' : 'Hiện lời thoại'}
              </button>
            </div>
          </div>
          {showTranscript ? (
            <ol id="transcript-lines" className={styles.lines}>
              {segments.map((s, i) => (
                <TranscriptLine
                  key={s.id}
                  segment={s}
                  current={i === playingIdx}
                  seekable={hasTimings}
                  showVi={showVi}
                  focusIds={focusIds}
                  selectedWordId={selection?.wordId ?? null}
                  onSelect={selectToken}
                  onSeek={() => player.seekSegment(i)}
                  onClick={(e) => onRowClick(e, i)}
                />
              ))}
            </ol>
          ) : (
            <div id="transcript-lines" className={styles.hidden}>
              <div className={styles.hiddenTitle}>Lời thoại đang ẩn</div>
              <div className={styles.muted}>
                Nghe ít nhất 2 lần và làm bài nghe chép trước, rồi mới mở để kiểm tra.
              </div>
            </div>
          )}
        </section>

        <div className={styles.side}>
          {selectedWord && (
            <WordCard
              word={selectedWord}
              senseId={selection?.senseId}
              surface={selection?.surface}
              saved={savedIds.has(selectedWord.id)}
              saving={toggleSave.isPending}
              onToggleSave={onToggleSave}
              onClose={() => setSelection(null)}
            />
          )}
          {toggleSave.isError && (
            <p role="alert" className={styles.saveError}>
              Không lưu được từ: {toggleSave.error.message}
            </p>
          )}

          <section aria-label="Bài tập" className={styles.exercises}>
            <div role="tablist" aria-label="Chế độ luyện" className={styles.tabs}>
              {(
                [
                  ['dictation', 'Nghe chép'],
                  ['quiz', 'Nghe hiểu'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  ref={(el) => {
                    tabRefs.current[key] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls={`panel-${key}`}
                  tabIndex={tab === key ? 0 : -1}
                  className={tab === key ? `${styles.tab} ${styles.tabOn}` : styles.tab}
                  onClick={() => setTab(key)}
                  onKeyDown={onTabKey}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="panel-dictation"
              aria-labelledby="tab-dictation"
              hidden={tab !== 'dictation'}
            >
              {dictation.length > 0 ? (
                <Dictation
                  slug={slug}
                  items={dictation}
                  onPlayItem={hasTimings ? playItem : undefined}
                  onChecked={onDictationChecked}
                />
              ) : (
                <p className={styles.muted}>Bài này không có phần nghe chép.</p>
              )}
            </div>
            <div role="tabpanel" id="panel-quiz" aria-labelledby="tab-quiz" hidden={tab !== 'quiz'}>
              {questions.length > 0 ? (
                <Quiz
                  bare
                  questions={questions}
                  answers={answers}
                  pendingId={pendingId}
                  error={quizError}
                  onPick={onPick}
                />
              ) : (
                <p className={styles.muted}>Bài này không có câu hỏi.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

interface TranscriptLineProps {
  segment: SegmentDto;
  current: boolean;
  seekable: boolean;
  showVi: boolean;
  focusIds: ReadonlySet<number>;
  selectedWordId: number | null;
  onSelect: (t: TokenDto) => void;
  onSeek: () => void;
  onClick: (e: MouseEvent<HTMLLIElement>) => void;
}

function TranscriptLine({
  segment: s,
  current,
  seekable,
  showVi,
  focusIds,
  selectedWordId,
  onSelect,
  onSeek,
  onClick,
}: TranscriptLineProps) {
  const time = formatTime(s.startMs);
  return (
    <li
      className={[styles.line, current && styles.current, seekable && styles.seekable]
        .filter(Boolean)
        .join(' ')}
      aria-current={current ? 'true' : undefined}
      data-testid={`line-${s.key}`}
      onClick={onClick}
    >
      {seekable ? (
        <button
          type="button"
          className={styles.time}
          onClick={onSeek}
          aria-label={`Nghe từ ${time}`}
        >
          {time}
        </button>
      ) : (
        <span className={styles.timeEmpty} aria-hidden="true" />
      )}
      <span className={s.speaker === 'B' ? `${styles.speaker} ${styles.speakerB}` : styles.speaker}>
        <span className="visually-hidden">Người nói </span>
        {s.speaker ?? ''}
      </span>
      <div className={styles.lineText}>
        <span className={styles.en} lang="en">
          <TokenizedText
            text={s.textEn}
            tokens={s.tokens}
            focusWordIds={focusIds}
            selectedWordId={selectedWordId}
            onSelect={onSelect}
          />
        </span>
        {showVi && s.textVi && <span className={styles.vi}>{s.textVi}</span>}
      </div>
    </li>
  );
}

/**
 * REST API contract (plan section 5): Zod schemas for request input and TypeScript types for
 * responses. Exposed as `@daily-learning/shared/api`.
 *
 * The web app imports only types from here (`import type`), so zod stays out of its bundle.
 */
import { z } from 'zod';
import {
  CEFR_LEVELS,
  LESSON_KINDS,
  LESSON_LEVELS,
  LESSON_PROGRESS_STATUSES,
  WORD_STATUSES,
  type CefrLevel,
  type LessonKind,
  type LessonLevel,
  type LessonProgressStatus,
  type Speaker,
  type WordStatus,
} from './constants.js';
import {
  REVIEW_RATINGS,
  VOCAB_SOURCES,
  VOCAB_STATUSES,
  type ReviewRating,
  type VocabStatus,
} from './srs.js';

/** `none` = single local user, no login. `password` = login required (VPS). */
export const AUTH_MODES = ['none', 'password'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

// Re-exported so API consumers can validate enums without importing constants separately.
export { CEFR_LEVELS, LESSON_KINDS, LESSON_LEVELS, LESSON_PROGRESS_STATUSES, WORD_STATUSES };

const id = z.coerce.number().int().positive();
const slugParam = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Error body for every non-2xx response. */
export interface ApiError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Auth: /api/auth/*
// ---------------------------------------------------------------------------

export const loginBodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1024),
});
export type LoginBody = z.input<typeof loginBodySchema>;

export interface AuthUser {
  id: number;
  /** Null for the default local user (`AUTH_MODE=none`). */
  email: string | null;
}

/** `GET /api/auth/me`, `POST /api/auth/login`. `user` is null when not logged in. */
export interface MeResponse {
  authMode: AuthMode;
  user: AuthUser | null;
}

// ---------------------------------------------------------------------------
// Lessons: /api/lessons
// ---------------------------------------------------------------------------

export const lessonListQuerySchema = z.strictObject({
  kind: z.enum(LESSON_KINDS).optional(),
  level: z.enum(LESSON_LEVELS).optional(),
});
export type LessonListQuery = z.input<typeof lessonListQuerySchema>;

export const lessonSlugParamsSchema = z.strictObject({ slug: slugParam });

export interface LessonProgressDto {
  status: LessonProgressStatus;
  /** Current step inside the lesson (0-based). */
  step: number;
  /** Share of correct answers, 0..1. */
  score: number | null;
  completedAt: string | null;
}

export interface LessonSummary {
  id: number;
  slug: string;
  kind: LessonKind;
  level: LessonLevel;
  title: string;
  topic: string;
  wordCount: number;
  /** Audio length in ms (from timings.json), or null without audio. */
  durationMs: number | null;
  /**
   * URL of audio.mp3 (`/content/…/audio.mp3?v=<hash>`), or null when the lesson has no audio
   * yet. Listening lessons: dialogue; reading lessons: narrator ("Nghe bài đọc").
   */
  audioUrl: string | null;
  orderIndex: number;
  progress: LessonProgressDto | null;
}

/** `GET /api/lessons` */
export interface LessonListResponse {
  lessons: LessonSummary[];
}

export interface TokenDto {
  /** Position inside the segment. */
  idx: number;
  surface: string;
  /** Character offsets in `textEn` (UTF-16 code units, end exclusive). */
  start: number;
  end: number;
  wordId: number;
  /** Sense used in this context (key into `WordDto.senses`). */
  senseId: number | null;
}

export interface SegmentDto {
  id: number;
  /** Segment id from lesson.yaml (`p1s2`, `l3`). */
  key: string;
  idx: number;
  paragraphIdx: number | null;
  speaker: Speaker | null;
  textEn: string;
  textVi: string | null;
  startMs: number | null;
  endMs: number | null;
  tokens: TokenDto[];
}

export interface SenseDto {
  id: number;
  key: string;
  pos: string;
  meaningVi: string;
  definitionEn: string;
  collocations: string[];
  example: string;
}

export interface WordDto {
  id: number;
  lemma: string;
  ipaUs: string;
  cefr: CefrLevel;
  isPhrase: boolean;
  status: WordStatus;
  /** URL of the pronunciation (`/content/words/<slug>.mp3?v=<hash>`), or null. */
  audioUrl: string | null;
  senses: SenseDto[];
}

export interface FocusWordDto {
  wordId: number;
  senseId: number | null;
}

/** A comprehension question. The correct option is never sent to the client. */
export interface QuestionDto {
  id: number;
  idx: number;
  prompt: string;
  options: string[];
  evidenceSegmentId: number | null;
}

/** A dictation gap. The answer is never sent to the client. */
export interface DictationItemDto {
  id: number;
  idx: number;
  segmentId: number;
  beforeText: string;
  afterText: string;
}

/** `GET /api/lessons/:slug` */
export interface LessonDetailResponse {
  lesson: LessonSummary;
  segments: SegmentDto[];
  /** Every word referenced by a token or focus word, keyed by word id. */
  words: Record<string, WordDto>;
  focusWords: FocusWordDto[];
  questions: QuestionDto[];
  dictation: DictationItemDto[];
  /**
   * Normalized waveform peaks (0..1) of the audio, or null without audio. Segment timings are in
   * `segments[].startMs/endMs`.
   */
  peaks: number[] | null;
}

/** `POST /api/lessons/:slug/answers` */
export const answerBodySchema = z.union([
  z.strictObject({ questionId: id, value: z.int().min(0).max(20) }),
  z.strictObject({ dictationItemId: id, value: z.string().max(200) }),
]);
export type AnswerBody = z.input<typeof answerBodySchema>;

export interface AnswerResponse {
  correct: boolean;
  feedback: string | null;
  /** Dictation only: the expected answer, sent back when the answer was wrong. */
  expected: string | null;
}

/** `POST /api/lessons/:slug/progress` */
export const progressBodySchema = z.strictObject({
  step: z.int().min(0).max(20),
  status: z.enum(LESSON_PROGRESS_STATUSES).optional(),
  score: z.number().min(0).max(1).nullable().optional(),
});
export type ProgressBody = z.input<typeof progressBodySchema>;

export interface ProgressResponse {
  progress: LessonProgressDto;
}

// ---------------------------------------------------------------------------
// Vocabulary: /api/vocab
// ---------------------------------------------------------------------------

export const vocabWordParamsSchema = z.strictObject({ wordId: id });

/** `POST /api/vocab/:wordId` */
export const saveWordBodySchema = z.strictObject({
  senseId: id.nullable().optional(),
  sourceLessonId: id.nullable().optional(),
});
export type SaveWordBody = z.input<typeof saveWordBodySchema>;

export interface SavedWordResponse {
  wordId: number;
  senseId: number | null;
  saved: boolean;
}

/** `GET /api/vocab/saved?lesson=<slug>` */
export const savedWordsQuerySchema = z.strictObject({ lesson: slugParam.optional() });

export interface SavedWordsResponse {
  wordIds: number[];
}

/** `GET /api/vocab?source=read|listen|all&status=new|learning|known|all` (word book) */
export const vocabListQuerySchema = z.strictObject({
  source: z.enum([...VOCAB_SOURCES, 'all']).default('all'),
  status: z.enum([...VOCAB_STATUSES, 'all']).default('all'),
});
export type VocabListQuery = z.input<typeof vocabListQuerySchema>;

export interface SourceLessonDto {
  id: number;
  slug: string;
  kind: LessonKind;
  title: string;
}

export interface VocabItemDto {
  wordId: number;
  lemma: string;
  /** Vietnamese meaning of the saved sense (first sense when none was saved). */
  meaningVi: string;
  status: VocabStatus;
  sourceLesson: SourceLessonDto | null;
  /** Next review (ISO 8601). */
  due: string;
  savedAt: string;
}

export interface VocabListResponse {
  items: VocabItemDto[];
}

/** `GET /api/vocab/stats` */
export interface VocabStatsResponse {
  total: number;
  new: number;
  learning: number;
  known: number;
  /** Cards due now. */
  due: number;
}

// ---------------------------------------------------------------------------
// Reviews (FSRS): /api/reviews
// ---------------------------------------------------------------------------

/** `GET /api/reviews/due?limit=` */
export const dueReviewsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type DueReviewsQuery = z.input<typeof dueReviewsQuerySchema>;

export interface ReviewPreviewDto {
  rating: ReviewRating;
  /** When the card would be due after this rating (ISO 8601). */
  due: string;
  /** Interval in Vietnamese ("10 phút", "1 ngày", "2 tuần"). */
  interval: string;
}

export interface ReviewCardDto {
  wordId: number;
  lemma: string;
  ipaUs: string;
  pos: string;
  meaningVi: string;
  example: string;
  sourceLesson: SourceLessonDto | null;
  /** Pronunciation URL, or null without audio. */
  audioUrl: string | null;
  status: VocabStatus;
  due: string;
  /** One preview per rating 1..4, computed with FSRS `repeat()`. */
  previews: ReviewPreviewDto[];
}

export interface ReviewCountsDto {
  /** Cards due now. */
  due: number;
  /** Reviews done today (Asia/Ho_Chi_Minh day). */
  doneToday: number;
}

export interface DueReviewsResponse {
  cards: ReviewCardDto[];
  counts: ReviewCountsDto;
  /** Earliest due date among cards not due yet (ISO 8601), or null. */
  nextDueAt: string | null;
}

/** `POST /api/reviews/:wordId` */
export const reviewBodySchema = z.strictObject({
  rating: z.literal(REVIEW_RATINGS),
});
export type ReviewBody = z.input<typeof reviewBodySchema>;

export interface CardStateDto {
  due: string;
  /** FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  status: VocabStatus;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  lastReview: string | null;
}

export interface ReviewResponse {
  wordId: number;
  rating: ReviewRating;
  card: CardStateDto;
  counts: ReviewCountsDto;
}

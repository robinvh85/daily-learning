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
  durationMs: number | null;
  /** URL path of the audio file, or null when the lesson has no audio yet. */
  audioPath: string | null;
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
  audioPath: string | null;
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

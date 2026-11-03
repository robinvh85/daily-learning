/**
 * API contract (plan section 5): request and response types of every `/api/*` path. Exposed as
 * `@daily-learning/shared/api`.
 *
 * There is no HTTP server: the web app answers these paths in the browser (`apps/web/src/backend`)
 * from the static content files and Firestore. The paths and types stay as a stable seam between
 * the pages and that backend.
 */
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
import type { ReviewRating, VocabSource, VocabStatus } from './srs.js';

/** `none` = no login screen. `password` = Firebase Auth email/password login (the mode used). */
export const AUTH_MODES = ['none', 'password'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

// Re-exported so API consumers can validate enums without importing constants separately.
export { CEFR_LEVELS, LESSON_KINDS, LESSON_LEVELS, LESSON_PROGRESS_STATUSES, WORD_STATUSES };

/** Error body for every non-2xx response. */
export interface ApiError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Auth: /api/auth/*
// ---------------------------------------------------------------------------

export interface LoginBody {
  email: string;
  password: string;
}

export interface AuthUser {
  /** Firebase Auth uid. */
  id: string;
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

export interface LessonListQuery {
  kind?: LessonKind;
  level?: LessonLevel;
  topic?: string;
}

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

/** A comprehension question (the correct option stays in the backend). */
export interface QuestionDto {
  id: number;
  idx: number;
  prompt: string;
  options: string[];
  evidenceSegmentId: number | null;
}

/** A dictation gap (the answer stays in the backend). */
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
export type AnswerBody =
  { questionId: number; value: number } | { dictationItemId: number; value: string };

export interface AnswerResponse {
  correct: boolean;
  feedback: string | null;
  /** Dictation only: the expected answer, sent back when the answer was wrong. */
  expected: string | null;
}

/** `POST /api/lessons/:slug/progress` */
export interface ProgressBody {
  step: number;
  status?: LessonProgressStatus;
  /** 0..1 */
  score?: number | null;
}

export interface ProgressResponse {
  progress: LessonProgressDto;
}

// ---------------------------------------------------------------------------
// Vocabulary: /api/vocab
// ---------------------------------------------------------------------------

/** `POST /api/vocab/:wordId` */
export interface SaveWordBody {
  senseId?: number | null;
  sourceLessonId?: number | null;
}

export interface SavedWordResponse {
  wordId: number;
  senseId: number | null;
  saved: boolean;
}

/** `GET /api/vocab/saved?lesson=<slug>` */
export interface SavedWordsResponse {
  wordIds: number[];
}

/** `GET /api/vocab?source=read|listen|all&status=new|learning|known|all` (word book) */
export interface VocabListQuery {
  /** Default `all`. */
  source?: VocabSource | 'all';
  /** Default `all`. */
  status?: VocabStatus | 'all';
}

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
export interface DueReviewsQuery {
  /** 1..200, default 50. */
  limit?: number;
}

export interface ReviewPreviewDto {
  rating: ReviewRating;
  /** When the card would be due after this rating (ISO 8601). */
  due: string;
  /** Interval in Vietnamese ("10 phút", "1 ngày", "2 tuần"). */
  interval: string;
}

/** A slice of an audio file. */
export interface AudioClipDto {
  url: string;
  startMs: number;
  endMs: number;
}

export interface ReviewCardDto {
  wordId: number;
  lemma: string;
  ipaUs: string;
  pos: string;
  meaningVi: string;
  /** A lesson sentence with the word when one has audio, else the dictionary example. */
  example: string;
  /** Where `example` is spoken in the lesson audio, or null (dictionary example, no audio). */
  exampleAudio: AudioClipDto | null;
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
export interface ReviewBody {
  rating: ReviewRating;
}

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

/** `GET /api/reviews/card/:wordId`: any saved word, due or not (picked from the word book). */
export interface ReviewCardResponse {
  card: ReviewCardDto;
}

/**
 * `POST /api/reviews/:wordId/postpone` ("Mai ôn"): the card comes back at the start of tomorrow
 * (Asia/Ho_Chi_Minh). Not an FSRS review: memory state and review log are untouched.
 */
export interface PostponeResponse {
  wordId: number;
  /** New due date (ISO 8601). */
  due: string;
  counts: ReviewCountsDto;
}

// ---------------------------------------------------------------------------
// Today's lesson: /api/today (Phase 5)
// ---------------------------------------------------------------------------

export const TODAY_STEP_STATUSES = ['not_started', 'in_progress', 'done'] as const;
export type TodayStepStatus = (typeof TODAY_STEP_STATUSES)[number];

/**
 * `plan`: a day of `daily-plan.yaml`. `fallback`: the plan ran out, next uncompleted lessons by
 * level/order. `finished`: every lesson is completed ("Đã học hết bài hiện có").
 */
export type TodaySource = 'plan' | 'fallback' | 'finished';

export interface TodayStepDto {
  kind: 'reading' | 'listening' | 'reviews';
  status: TodayStepStatus;
  /** 0..100 */
  progressPct: number;
  /** Estimated minutes for the whole step. */
  minutes: number;
  /** Page that continues this step. */
  url: string;
  /** Reading/listening steps only. */
  lesson: LessonSummary | null;
  /** Reviews step only. */
  reviews: ReviewCountsDto | null;
}

/** `GET /api/today` */
export interface TodayResponse {
  /** Local date (Asia/Ho_Chi_Minh), `YYYY-MM-DD`. */
  date: string;
  source: TodaySource;
  /** Day N of the learning path (null when `finished`). */
  day: number | null;
  title: string;
  /** Reading, listening (when the day has them) and reviews, in this order. */
  steps: TodayStepDto[];
  /** Minutes left for the steps that are not done. */
  estimatedMinutes: number;
  /** First unfinished step, or null when everything is done. */
  continueUrl: string | null;
  /** Every step is done. */
  allDone: boolean;
}

// ---------------------------------------------------------------------------
// Activity: /api/activity (Phase 5)
// ---------------------------------------------------------------------------

/** Longest study time one heartbeat can add. */
export const HEARTBEAT_MAX_SECONDS = 60;

/** `POST /api/activity/heartbeat`. `seconds` is clamped to 0..60 by the backend. */
export interface HeartbeatBody {
  seconds: number;
}

export interface HeartbeatResponse {
  /** Seconds added by this heartbeat (after clamping). */
  added: number;
  /** Total for today (Asia/Ho_Chi_Minh day). */
  secondsToday: number;
}

// ---------------------------------------------------------------------------
// Dashboard: /api/dashboard (Phase 5)
// ---------------------------------------------------------------------------

export interface WeekDayDto {
  /** `YYYY-MM-DD` (Asia/Ho_Chi_Minh). */
  date: string;
  minutes: number;
}

/** `GET /api/dashboard` */
export interface DashboardResponse {
  displayName: string;
  level: LessonLevel;
  /** Local date (Asia/Ho_Chi_Minh), `YYYY-MM-DD`. */
  date: string;
  streak: {
    /** Consecutive active days ending today or yesterday. */
    days: number;
    activeToday: boolean;
  };
  path: {
    level: LessonLevel;
    completed: number;
    total: number;
    /** 0..100 */
    percent: number;
  };
  words: {
    /** known + learning */
    remembered: number;
    known: number;
    learning: number;
    /** Remembered words flagged `oxford3000`. */
    oxford3000: number;
  };
  week: {
    totalMinutes: number;
    dailyGoalMin: number;
    /** Monday → Sunday. */
    days: WeekDayDto[];
  };
}

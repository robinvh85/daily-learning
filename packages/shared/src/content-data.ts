/**
 * Static content files (`/content/data/*.json`), generated from `content/` by `npm run
 * content:build` and served by Firebase Hosting. The web app reads them instead of an API.
 * Exposed as `@daily-learning/shared/content-data` (types only, no runtime code besides paths).
 *
 * Ids are derived from natural keys (lemma, slug, sense key, segment key, question index), so the
 * same content always yields the same ids, whatever the build order. User data in Firestore
 * stores the natural keys, never these ids.
 */
import type { LessonKind, LessonLevel } from './constants.js';
import type {
  DictationItemDto,
  FocusWordDto,
  LessonSummary,
  QuestionDto,
  SegmentDto,
  WordDto,
} from './api.js';

/** URL prefix of the generated JSON files. */
export const CONTENT_DATA_PREFIX = '/content/data';

/** `catalog.json`: everything needed outside a lesson page. */
export interface ContentCatalog {
  /** Hash of the generated content (changes when any file changes). */
  version: string;
  /** Library order: level, then `order`, then title. */
  lessons: CatalogLesson[];
  /** The whole dictionary, sorted by lemma. */
  words: CatalogWord[];
  /** `daily-plan.yaml`, sorted by day. */
  plan: CatalogPlanDay[];
}

export type CatalogLesson = Omit<LessonSummary, 'progress'>;

export interface CatalogWord extends WordDto {
  oxford3000: boolean;
}

export interface CatalogPlanDay {
  day: number;
  title: string | null;
  /** Lesson slugs. */
  reading: string | null;
  listening: string | null;
}

export interface LessonQuestionData extends QuestionDto {
  correctIdx: number;
  feedbackOk: string | null;
  feedbackWrong: string | null;
}

export interface LessonDictationData extends DictationItemDto {
  answer: string;
}

/** `lessons/<slug>.json` */
export interface LessonData {
  slug: string;
  segments: SegmentDto[];
  focusWords: FocusWordDto[];
  questions: LessonQuestionData[];
  dictation: LessonDictationData[];
  peaks: number[] | null;
  /** Every word id used by a token or a focus word (sorted). */
  wordIds: number[];
}

/** A lesson sentence that contains a word and can be played from the lesson audio. */
export interface WordExample {
  lessonId: number;
  /** Sense of the word in that sentence. */
  senseId: number | null;
  textEn: string;
  audioUrl: string;
  startMs: number;
  endMs: number;
}

/**
 * `examples.json`: per word id, the first sentence of each (lesson, sense) pair, in library
 * order. Only lessons with audio and segments with timings are included.
 */
export interface ExamplesData {
  version: string;
  byWord: Record<string, WordExample[]>;
}

export interface LessonRef {
  id: number;
  slug: string;
  kind: LessonKind;
  level: LessonLevel;
}

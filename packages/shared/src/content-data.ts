/**
 * Static content files (`/content/data/*.json`), generated from `content/` by `npm run
 * content:build` and served by Firebase Hosting. The web app reads them instead of an API.
 * Exposed as `@daily-learning/shared/content-data` (types only, no runtime code besides paths).
 *
 * Ids are derived from natural keys (lemma, slug, sense key, segment key, question index), so the
 * same content always yields the same ids, whatever the build order. User data in Firestore
 * stores the natural keys, never these ids.
 */
import type { GrammarGroup, LessonKind, LessonLevel, WordStatus } from './constants.js';
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
  /** `content/grammar/*.yaml`: level, then first plan day, then title. */
  grammar: CatalogGrammarPoint[];
}

/** A grammar point as listed in the grammar library (details in `grammar/<slug>.json`). */
export interface CatalogGrammarPoint {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  level: LessonLevel;
  group: GrammarGroup;
  summary: string;
  status: WordStatus;
  exerciseCount: number;
  /** First form pattern (`S + V-ed`), shown as a one-line formula in the grammar card. */
  pattern: string | null;
  /** Plan days that teach this point (usually one). */
  days: number[];
  /** Slugs of the lessons that have a sentence marked with this point, in library order. */
  lessons: string[];
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
  /** Grammar point slug. */
  grammar: string | null;
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
  /** Sentences marked with a grammar point, one item per (segment, point), in segment order. */
  grammar: LessonGrammarMark[];
}

/** UTF-16 offsets `[start, end)` inside `SegmentDto.textEn`. */
export type TextRange = [number, number];

export interface LessonGrammarMark {
  segmentId: number;
  /** Grammar point slug. */
  point: string;
  /** Parts to underline, in order. */
  ranges: TextRange[];
  /** Notes written for this sentence (several when the sentence was marked more than once). */
  notes: string[];
}

/** Where a "Nhận ra" example comes from. */
export type GrammarExampleSource = 'day' | 'pinned' | 'other';

/** A lesson sentence that shows a grammar point. */
export interface GrammarExample {
  source: GrammarExampleSource;
  lessonSlug: string;
  lessonKind: LessonKind;
  lessonTitle: string;
  segmentId: number;
  /** Segment id in lesson.yaml (`p1s2`), used in links to the sentence. */
  segmentKey: string;
  textEn: string;
  textVi: string | null;
  ranges: TextRange[];
  notes: string[];
}

interface GrammarExerciseBase {
  id: number;
  idx: number;
  explain: string;
}

export interface GrammarChoiceExercise extends GrammarExerciseBase {
  type: 'choice';
  prompt: string;
  options: string[];
  correctIdx: number;
}

export interface GrammarGapExercise extends GrammarExerciseBase {
  type: 'gap';
  prompt: string;
  answer: string;
  accept: string[];
}

export interface GrammarOrderExercise extends GrammarExerciseBase {
  type: 'order';
  words: string[];
  answer: string;
}

export interface GrammarFindErrorExercise extends GrammarExerciseBase {
  type: 'find_error';
  sentence: string;
  wrong: string;
  right: string;
}

export type GrammarExerciseData =
  GrammarChoiceExercise | GrammarGapExercise | GrammarOrderExercise | GrammarFindErrorExercise;

/** `grammar/<slug>.json` */
export interface GrammarPointData {
  slug: string;
  discover: {
    question: string;
    answer: string;
    /** The day's own sentences first, then pinned ones, then the others in library order. */
    examples: GrammarExample[];
  };
  form: { label: string; pattern: string; example: string }[];
  usage: string[];
  signals: string[];
  spelling: string[];
  mistakes: { wrong: string; right: string; why: string }[];
  exercises: GrammarExerciseData[];
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

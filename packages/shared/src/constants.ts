/** Lesson kinds (plan section 4, `lessons.kind`). */
export const LESSON_KINDS = ['reading', 'listening'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/** Lesson levels on the A2 → B1 path (`lessons.level`). */
export const LESSON_LEVELS = ['A2', 'A2+', 'B1'] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

/** CEFR levels used for dictionary entries (`words.cefr`). */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Review status of a dictionary entry (`words.status`). */
export const WORD_STATUSES = ['draft', 'reviewed'] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

/** Speakers in a listening dialogue. */
export const SPEAKERS = ['A', 'B'] as const;
export type Speaker = (typeof SPEAKERS)[number];

/** Parts of speech allowed in `word_senses.pos`. */
export const PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'modal verb',
  'phrasal verb',
  'adjective',
  'adverb',
  'pronoun',
  'determiner',
  'preposition',
  'conjunction',
  'exclamation',
  'number',
  'infinitive marker',
  'contraction',
  'phrase',
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** Status of a lesson for one user (`lesson_progress.status`). */
export const LESSON_PROGRESS_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

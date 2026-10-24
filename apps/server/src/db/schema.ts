/**
 * Database schema (plan section 4).
 *
 * Content tables are generated from `content/` by `npm run content:sync` and can be rebuilt
 * at any time. Their ids stay stable across syncs (rows are upserted by natural keys such as
 * `lessons.slug`, `words.lemma`, `(lesson_id, key)`), so user tables can reference them.
 *
 * User tables hold progress and must be backed up.
 */
import {
  CEFR_LEVELS,
  LESSON_KINDS,
  LESSON_LEVELS,
  LESSON_PROGRESS_STATUSES,
  SPEAKERS,
  WORD_STATUSES,
} from '@daily-learning/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Current time in epoch milliseconds, evaluated by SQLite. */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

// ---------------------------------------------------------------------------
// Content (generated from content/)
// ---------------------------------------------------------------------------

export const lessons = sqliteTable('lessons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  kind: text('kind', { enum: LESSON_KINDS }).notNull(),
  level: text('level', { enum: LESSON_LEVELS }).notNull(),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  wordCount: integer('word_count').notNull(),
  durationMs: integer('duration_ms'),
  /** Paths relative to `content/`, e.g. `lessons/a2/at-the-train-station/audio.mp3`. */
  audioPath: text('audio_path'),
  /** Short hash of audio.mp3, appended as `?v=` so the file can be cached forever. */
  audioVersion: text('audio_version'),
  /** Normalized waveform peaks (0..1) from timings.json. */
  peaks: text('peaks', { mode: 'json' }).$type<number[]>(),
  coverPath: text('cover_path'),
  orderIndex: integer('order_index').notNull().default(0),
});

export const segments = sqliteTable(
  'segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    /** Segment id from lesson.yaml (`p1s2`, `l3`). */
    key: text('key').notNull(),
    idx: integer('idx').notNull(),
    paragraphIdx: integer('paragraph_idx'),
    speaker: text('speaker', { enum: SPEAKERS }),
    textEn: text('text_en').notNull(),
    textVi: text('text_vi'),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
  },
  (t) => [
    uniqueIndex('segments_lesson_key_uq').on(t.lessonId, t.key),
    index('segments_lesson_idx').on(t.lessonId, t.idx),
  ],
);

export const words = sqliteTable('words', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lemma: text('lemma').notNull().unique(),
  ipaUs: text('ipa_us').notNull(),
  cefr: text('cefr', { enum: CEFR_LEVELS }).notNull(),
  oxford3000: integer('oxford3000', { mode: 'boolean' }).notNull(),
  isPhrase: integer('is_phrase', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: WORD_STATUSES }).notNull(),
  /** `words/<lemma-slug>.mp3` relative to `content/`, when the file exists. */
  audioPath: text('audio_path'),
  audioVersion: text('audio_version'),
});

/** Every surface form (lowercase, straight apostrophe) → lemma. Includes the lemma itself. */
export const wordForms = sqliteTable(
  'word_forms',
  {
    form: text('form').primaryKey(),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
  },
  (t) => [index('word_forms_word_idx').on(t.wordId)],
);

export const wordSenses = sqliteTable(
  'word_senses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** Order inside the entry; 0 is the default sense. */
    idx: integer('idx').notNull(),
    pos: text('pos').notNull(),
    meaningVi: text('meaning_vi').notNull(),
    definitionEn: text('definition_en').notNull(),
    collocations: text('collocations', { mode: 'json' }).$type<string[]>().notNull(),
    example: text('example').notNull(),
  },
  (t) => [uniqueIndex('word_senses_word_key_uq').on(t.wordId, t.key)],
);

/** Pre-computed tokens so the UI only has to render them. */
export const lessonTokens = sqliteTable(
  'lesson_tokens',
  {
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    segmentId: integer('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    surface: text('surface').notNull(),
    /** Character offsets in `segments.text_en` (UTF-16 code units, end exclusive). */
    startChar: integer('start_char').notNull(),
    endChar: integer('end_char').notNull(),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    senseId: integer('sense_id').references(() => wordSenses.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.segmentId, t.idx] }),
    index('lesson_tokens_lesson_idx').on(t.lessonId),
  ],
);

/** Focus words of a lesson. */
export const lessonWords = sqliteTable(
  'lesson_words',
  {
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    senseId: integer('sense_id').references(() => wordSenses.id, { onDelete: 'set null' }),
    idx: integer('idx').notNull(),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.wordId] })],
);

export const questions = sqliteTable(
  'questions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    prompt: text('prompt').notNull(),
    options: text('options', { mode: 'json' }).$type<string[]>().notNull(),
    correctIdx: integer('correct_idx').notNull(),
    feedbackOk: text('feedback_ok'),
    feedbackWrong: text('feedback_wrong'),
    evidenceSegmentId: integer('evidence_segment_id').references(() => segments.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('questions_lesson_idx_uq').on(t.lessonId, t.idx)],
);

export const dictationItems = sqliteTable(
  'dictation_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    segmentId: integer('segment_id')
      .notNull()
      .references(() => segments.id, { onDelete: 'cascade' }),
    answer: text('answer').notNull(),
    beforeText: text('before_text').notNull(),
    afterText: text('after_text').notNull(),
  },
  (t) => [uniqueIndex('dictation_items_lesson_idx_uq').on(t.lessonId, t.idx)],
);

/** Day N of the learning path → its reading and listening lesson. */
export const dailyPlansTemplate = sqliteTable('daily_plans_template', {
  day: integer('day').primaryKey(),
  readingLessonId: integer('reading_lesson_id').references(() => lessons.id, {
    onDelete: 'set null',
  }),
  listeningLessonId: integer('listening_lesson_id').references(() => lessons.id, {
    onDelete: 'set null',
  }),
});

// ---------------------------------------------------------------------------
// User progress (must be backed up)
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Null for the default local user (`AUTH_MODE=none`). */
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  level: text('level', { enum: LESSON_LEVELS }).notNull().default('A2'),
  dailyGoalMin: integer('daily_goal_min').notNull().default(15),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
});

/**
 * Login sessions (`AUTH_MODE=password`, plan 2.6). The cookie holds a random token; only its
 * SHA-256 hash is stored, so a leaked database does not leak usable sessions.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 (hex) of the session token. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const lessonProgress = sqliteTable(
  'lesson_progress',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    status: text('status', { enum: LESSON_PROGRESS_STATUSES }).notNull().default('not_started'),
    /** Current step inside the lesson (0-based). */
    step: integer('step').notNull().default(0),
    /** Share of correct answers, 0..1. */
    score: real('score'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const answers = sqliteTable(
  'answers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: integer('question_id').references(() => questions.id, { onDelete: 'cascade' }),
    dictationItemId: integer('dictation_item_id').references(() => dictationItems.id, {
      onDelete: 'cascade',
    }),
    value: text('value').notNull(),
    correct: integer('correct', { mode: 'boolean' }).notNull(),
    answeredAt: integer('answered_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [
    index('answers_user_idx').on(t.userId, t.answeredAt),
    check('answers_one_target', sql`("question_id" is null) <> ("dictation_item_id" is null)`),
  ],
);

/**
 * Saved words with their FSRS card state (`ts-fsrs`, Phase 4).
 * `word_id` is ON DELETE RESTRICT: content:sync refuses to drop a dictionary entry a user saved.
 */
export const userWords = sqliteTable(
  'user_words',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'restrict' }),
    /** Sense shown when the word was saved (null → first sense). */
    senseId: integer('sense_id').references(() => wordSenses.id, { onDelete: 'set null' }),
    sourceLessonId: integer('source_lesson_id').references(() => lessons.id, {
      onDelete: 'set null',
    }),
    due: integer('due', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
    state: integer('state').notNull().default(0),
    lastReview: integer('last_review', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.wordId] }),
    index('user_words_due_idx').on(t.userId, t.due),
  ],
);

export const reviewLogs = sqliteTable(
  'review_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    /** FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
    rating: integer('rating').notNull(),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    elapsedDays: real('elapsed_days').notNull().default(0),
  },
  (t) => [
    index('review_logs_user_idx').on(t.userId, t.reviewedAt),
    check('review_logs_rating', sql`"rating" between 1 and 4`),
  ],
);

export const dailyActivity = sqliteTable(
  'daily_activity',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Local date (Asia/Ho_Chi_Minh), `YYYY-MM-DD`. */
    date: text('date').notNull(),
    secondsStudied: integer('seconds_studied').notNull().default(0),
    lessonsDone: integer('lessons_done').notNull().default(0),
    reviewsDone: integer('reviews_done').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/**
 * Zod schemas for the files under `content/` (plan sections 2.3 and 2.5):
 *  - `content/lessons/<level>/<slug>/lesson.yaml`
 *  - `content/dictionary/<lemma>.yaml`
 *  - `content/daily-plan.yaml`
 *
 * Exposed as `@daily-learning/shared/content` so the web bundle does not pull in zod
 * unless it needs it.
 */
import { z } from 'zod';
import {
  CEFR_LEVELS,
  LESSON_KINDS,
  LESSON_LEVELS,
  PARTS_OF_SPEECH,
  SPEAKERS,
  WORD_STATUSES,
} from './constants.js';

const text = z.string().trim().min(1);

/** Lesson slugs and segment ids: lowercase letters, digits and dashes. */
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and single dashes');

/** Sense keys inside a dictionary entry, e.g. `manage`, `start_business`. */
const senseKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'use lowercase letters, digits and underscores');

/**
 * Key of the lesson `senses` map: a word (lemma or any form), optionally followed by
 * `#n` to pick the n-th occurrence of that lemma in the lesson (1-based).
 */
export const SENSE_REF_PATTERN = /^([^#\s](?:[^#]*[^#\s])?)(?:#([1-9]\d*))?$/;

function lowerSet(items: readonly string[]): Set<string> {
  return new Set(items.map((s) => s.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Dictionary entry: content/dictionary/<lemma>.yaml
// ---------------------------------------------------------------------------

export const dictionarySenseSchema = z.strictObject({
  key: senseKey,
  pos: z.enum(PARTS_OF_SPEECH),
  /** Vietnamese meaning, written for this sense. */
  vi: text,
  /** Short English definition. */
  en: text,
  collocations: z.array(text).default([]),
  example: text,
});

/** Words and phrases are written with a straight apostrophe (`I'm`), never `’`. */
const dictWord = text
  .refine((s) => !/[’‘]/.test(s), "use a straight apostrophe (') instead of ’")
  .refine((s) => !/\s{2,}/.test(s), 'use single spaces between words');

export const dictionaryEntrySchema = z
  .strictObject({
    /** Base form as it should be displayed (`run`, `I`, `Saturday`, `coffee shop`). */
    lemma: dictWord,
    /** US pronunciation between slashes, e.g. `/ˈoʊpən/`. */
    ipa_us: z.string().regex(/^\/[^/]+\/$/, 'write the IPA between slashes, e.g. /rʌn/'),
    cefr: z.enum(CEFR_LEVELS),
    oxford3000: z.boolean(),
    /** True for multi-word entries (`coffee shop`, `next to`). Must match the lemma. */
    is_phrase: z.boolean().default(false),
    /** Other surface forms mapped to this lemma (`runs`, `ran`, `running`). */
    forms: z.array(dictWord).default([]),
    senses: z.array(dictionarySenseSchema).min(1),
    status: z.enum(WORD_STATUSES),
  })
  .superRefine((entry, ctx) => {
    const multiWord = entry.lemma.includes(' ');
    if (entry.is_phrase !== multiWord) {
      ctx.addIssue({
        code: 'custom',
        path: ['is_phrase'],
        message: multiWord
          ? 'lemma has several words, set is_phrase: true'
          : 'lemma is a single word, remove is_phrase or set it to false',
      });
    }
    const keys = new Set<string>();
    entry.senses.forEach((s, i) => {
      if (keys.has(s.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['senses', i, 'key'],
          message: `duplicate sense key "${s.key}"`,
        });
      }
      keys.add(s.key);
    });
    const seen = new Set([entry.lemma.toLowerCase()]);
    entry.forms.forEach((f, i) => {
      const k = f.toLowerCase();
      if (seen.has(k)) {
        ctx.addIssue({
          code: 'custom',
          path: ['forms', i],
          message: `"${f}" is listed twice (or equals the lemma)`,
        });
      }
      seen.add(k);
    });
  });

export type DictionarySense = z.output<typeof dictionarySenseSchema>;
export type DictionaryEntry = z.output<typeof dictionaryEntrySchema>;

// ---------------------------------------------------------------------------
// Lesson: content/lessons/<level>/<slug>/lesson.yaml
// ---------------------------------------------------------------------------

export const lessonSegmentSchema = z.strictObject({
  /** Stable id inside the lesson (`p1s2`, `l3`), referenced by questions and dictation. */
  id: slug,
  text_en: text,
  /** Vietnamese translation. Required for reading lessons, optional for listening. */
  text_vi: text.optional(),
  /** Reading only: paragraph number, 1-based. Several sentences can share a paragraph. */
  paragraph: z.int().min(1).optional(),
  /** Listening only: who is speaking. */
  speaker: z.enum(SPEAKERS).optional(),
  /** Optional timings (normally produced by `content:tts` into timings.json). */
  start_ms: z.int().nonnegative().optional(),
  end_ms: z.int().nonnegative().optional(),
});

export const lessonQuestionSchema = z
  .strictObject({
    prompt: text,
    options: z.array(text).min(2).max(6),
    /** Index of the correct option, 0-based. */
    correct: z.int().min(0),
    feedback_ok: text.optional(),
    feedback_wrong: text.optional(),
    /** Segment id that contains the answer. */
    evidence: slug.optional(),
  })
  .refine((q) => q.correct < q.options.length, {
    path: ['correct'],
    message: 'correct must be the index of one of the options (0-based)',
  });

export const lessonDictationSchema = z.strictObject({
  /** Segment id the gap belongs to. */
  segment: slug,
  answer: text,
  /** Text shown before the gap. `before + ' ' + answer` must appear in the segment. */
  before: z.string().trim().default(''),
  /** Text shown after the gap. */
  after: z.string().trim().default(''),
});

export const lessonSchema = z
  .strictObject({
    kind: z.enum(LESSON_KINDS),
    level: z.enum(LESSON_LEVELS),
    /** Topic key used by the library filter, e.g. `daily-life`, `travel`. */
    topic: slug,
    title: text,
    /** Sort order inside the library (lower first). */
    order: z.int().min(0).default(0),
    segments: z.array(lessonSegmentSchema).min(1),
    /** Focus words: lemmas or forms that appear in the lesson. */
    focus_words: z.array(text).default([]),
    /** Sense choice per word: `{ run: manage, "run#2": move }`. */
    senses: z
      .record(z.string().regex(SENSE_REF_PATTERN, 'use "word" or "word#n"'), senseKey)
      .default({}),
    /** Names, places or other text that must not be looked up (`Lan`, `Oxford`). */
    ignore: z.array(text).default([]),
    questions: z.array(lessonQuestionSchema).default([]),
    dictation: z.array(lessonDictationSchema).default([]),
  })
  .superRefine((lesson, ctx) => {
    const byId = new Map<string, z.output<typeof lessonSegmentSchema>>();
    let lastParagraph = 0;
    lesson.segments.forEach((seg, i) => {
      const at = (key: string) => ['segments', i, key];
      if (byId.has(seg.id))
        ctx.addIssue({
          code: 'custom',
          path: at('id'),
          message: `duplicate segment id "${seg.id}"`,
        });
      byId.set(seg.id, seg);

      if (lesson.kind === 'reading') {
        if (seg.paragraph === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: at('paragraph'),
            message: 'reading segments need a paragraph number',
          });
        } else if (seg.paragraph !== lastParagraph && seg.paragraph !== lastParagraph + 1) {
          ctx.addIssue({
            code: 'custom',
            path: at('paragraph'),
            message: `paragraph numbers must start at 1 and increase by 1 (got ${seg.paragraph} after ${lastParagraph})`,
          });
        } else {
          lastParagraph = seg.paragraph;
        }
        if (seg.speaker !== undefined)
          ctx.addIssue({
            code: 'custom',
            path: at('speaker'),
            message: 'speaker is only for listening lessons',
          });
        if (seg.text_vi === undefined)
          ctx.addIssue({
            code: 'custom',
            path: at('text_vi'),
            message: 'reading segments need a Vietnamese translation',
          });
      } else {
        if (seg.speaker === undefined)
          ctx.addIssue({
            code: 'custom',
            path: at('speaker'),
            message: 'listening segments need a speaker (A or B)',
          });
        if (seg.paragraph !== undefined)
          ctx.addIssue({
            code: 'custom',
            path: at('paragraph'),
            message: 'paragraph is only for reading lessons',
          });
      }
      if (seg.start_ms !== undefined && seg.end_ms !== undefined && seg.end_ms <= seg.start_ms) {
        ctx.addIssue({
          code: 'custom',
          path: at('end_ms'),
          message: 'end_ms must be greater than start_ms',
        });
      }
    });

    lesson.questions.forEach((q, i) => {
      if (q.evidence !== undefined && !byId.has(q.evidence)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', i, 'evidence'],
          message: `unknown segment id "${q.evidence}"`,
        });
      }
    });

    if (lesson.kind === 'reading' && lesson.dictation.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['dictation'],
        message: 'dictation is only for listening lessons',
      });
    }
    lesson.dictation.forEach((d, i) => {
      const seg = byId.get(d.segment);
      if (!seg) {
        ctx.addIssue({
          code: 'custom',
          path: ['dictation', i, 'segment'],
          message: `unknown segment id "${d.segment}"`,
        });
        return;
      }
      const expected = d.before ? `${d.before} ${d.answer}` : d.answer;
      const at = seg.text_en.indexOf(expected);
      const rest = at < 0 ? '' : seg.text_en.slice(at + expected.length);
      const afterCore = d.after.replace(/[.,!?;:]+$/, '').trim();
      if (at < 0 || /^[\p{L}\p{N}]/u.test(rest) || !rest.trimStart().startsWith(afterCore)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dictation', i],
          message: `"${[d.before, '____', d.after].filter(Boolean).join(' ')}" with answer "${d.answer}" does not match segment "${d.segment}"`,
        });
      }
    });

    const focus = new Set<string>();
    lesson.focus_words.forEach((w, i) => {
      const k = w.toLowerCase();
      if (focus.has(k))
        ctx.addIssue({
          code: 'custom',
          path: ['focus_words', i],
          message: `duplicate focus word "${w}"`,
        });
      focus.add(k);
    });
    const ignored = lowerSet(lesson.ignore);
    if (ignored.size !== lesson.ignore.length) {
      ctx.addIssue({ code: 'custom', path: ['ignore'], message: 'duplicate entries in ignore' });
    }
  });

export type LessonSegment = z.output<typeof lessonSegmentSchema>;
export type LessonQuestion = z.output<typeof lessonQuestionSchema>;
export type LessonDictation = z.output<typeof lessonDictationSchema>;
export type LessonFile = z.output<typeof lessonSchema>;

// ---------------------------------------------------------------------------
// Daily plan template: content/daily-plan.yaml
// ---------------------------------------------------------------------------

export const dailyPlanSchema = z
  .strictObject({
    days: z
      .array(
        z.strictObject({
          day: z.int().min(1),
          /** Vietnamese title of the day, shown on Home ("Cuộc sống quanh khu phố"). */
          title: text.optional(),
          /** Slug of the reading lesson for this day. */
          reading: slug.optional(),
          /** Slug of the listening lesson for this day. */
          listening: slug.optional(),
        }),
      )
      .min(1),
  })
  .superRefine((plan, ctx) => {
    const days = new Set<number>();
    plan.days.forEach((d, i) => {
      if (days.has(d.day))
        ctx.addIssue({
          code: 'custom',
          path: ['days', i, 'day'],
          message: `duplicate day ${d.day}`,
        });
      days.add(d.day);
      if (!d.reading && !d.listening) {
        ctx.addIssue({
          code: 'custom',
          path: ['days', i],
          message: 'a day needs a reading or a listening lesson',
        });
      }
    });
  });

export type DailyPlanFile = z.output<typeof dailyPlanSchema>;

// ---------------------------------------------------------------------------
// Audio timings: content/lessons/<level>/<slug>/timings.json (written by `content:tts`)
// ---------------------------------------------------------------------------

export const timingsSegmentSchema = z.strictObject({
  /** Segment id from lesson.yaml. */
  id: slug,
  startMs: z.int().nonnegative(),
  endMs: z.int().positive(),
});

export const timingsSchema = z
  .strictObject({
    version: z.literal(1),
    /** Duration of audio.mp3 in milliseconds (ffprobe). */
    durationMs: z.int().positive(),
    /**
     * Hash of the segment ids, speakers and texts the audio was made from. `content:build` warns
     * when lesson.yaml changed after the audio was generated.
     */
    textHash: z.string().regex(/^[0-9a-f]{16}$/),
    segments: z.array(timingsSegmentSchema).min(1),
    /** Normalized waveform peaks (0..1), one per bar. */
    peaks: z.array(z.number().min(0).max(1)).max(400),
  })
  .superRefine((t, ctx) => {
    let last = 0;
    t.segments.forEach((s, i) => {
      if (s.endMs <= s.startMs) {
        ctx.addIssue({ code: 'custom', path: ['segments', i], message: 'endMs must be > startMs' });
      }
      if (s.startMs < last) {
        ctx.addIssue({
          code: 'custom',
          path: ['segments', i],
          message: 'segments must not overlap and must be in order',
        });
      }
      last = s.endMs;
    });
    if (last > t.durationMs + 50) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMs'],
        message: 'last segment ends after the audio',
      });
    }
  });

export type TimingsFile = z.output<typeof timingsSchema>;

// ---------------------------------------------------------------------------
// TTS voices: content/tts.config.yaml (read by `content:tts` and `content:tts-words`)
// ---------------------------------------------------------------------------

/** A Google Cloud TTS voice name, e.g. `en-US-Chirp3-HD-Aoede`, `en-US-Neural2-F`. */
const voiceName = z
  .string()
  .regex(/^en-US-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'use an en-US voice name, e.g. en-US-Neural2-F');

export const ttsConfigSchema = z.strictObject({
  /** Listening lessons: voice of speaker A and speaker B. */
  speakerA: voiceName,
  speakerB: voiceName,
  /** Reading lessons ("Nghe bài đọc"). */
  narrator: voiceName,
  /** Word pronunciation (`content/words/<lemma-slug>.mp3`). */
  word: voiceName,
  /** 0.25–2.0. Ignored for voices that do not support it (Chirp 3 HD). */
  speakingRate: z.number().min(0.25).max(2).default(1),
  /** Silence between two segments, in milliseconds. */
  gapMs: z.int().min(0).max(3000).default(400),
});

export type TtsConfig = z.output<typeof ttsConfigSchema>;

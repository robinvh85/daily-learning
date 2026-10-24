/**
 * `content:sync`: validate `content/` and upsert it into SQLite in one transaction.
 *
 * Idempotent: rows are upserted by natural keys (`words.lemma`, `(word_id, key)`, `lessons.slug`,
 * `(lesson_id, key)`, `(lesson_id, idx)`, `day`), so ids stay stable and user tables keep pointing
 * at the right rows. Rows that disappeared from `content/` are deleted.
 */
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import {
  dailyPlansTemplate,
  dictationItems,
  lessonTokens,
  lessonWords,
  lessons,
  questions,
  segments,
  userWords,
  wordForms,
  wordSenses,
  words,
} from '../db/schema.js';
import { hasErrors, loadContent, type ContentBundle, type ContentIssue } from './load.js';
import { normalizeWord } from './tokenizer.js';

export interface SyncCounts {
  words: number;
  senses: number;
  forms: number;
  lessons: number;
  segments: number;
  tokens: number;
  focusWords: number;
  questions: number;
  dictation: number;
  planDays: number;
}

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  issues: ContentIssue[];
  counts: SyncCounts | null;
}

export class ContentSyncError extends Error {}

/** Write a validated bundle into the database (one transaction). */
export function writeBundle(db: AppDatabase, bundle: ContentBundle): SyncCounts {
  return db.transaction((tx) => {
    const counts: SyncCounts = {
      words: 0,
      senses: 0,
      forms: 0,
      lessons: 0,
      segments: 0,
      tokens: 0,
      focusWords: 0,
      questions: 0,
      dictation: 0,
      planDays: 0,
    };

    // --- Dictionary -------------------------------------------------------
    const wordIds = new Map<string, number>(); // lemma key → id
    const senseIds = new Map<string, number>(); // `${lemmaKey}\u0000${senseKey}` → id
    for (const { entry } of bundle.entries) {
      const values = {
        lemma: entry.lemma,
        ipaUs: entry.ipa_us,
        cefr: entry.cefr,
        oxford3000: entry.oxford3000,
        isPhrase: entry.is_phrase,
        status: entry.status,
      };
      const row = tx
        .insert(words)
        .values(values)
        .onConflictDoUpdate({ target: words.lemma, set: values })
        .returning({ id: words.id })
        .get();
      const key = normalizeWord(entry.lemma);
      wordIds.set(key, row.id);
      counts.words++;

      entry.senses.forEach((s, idx) => {
        const sv = {
          wordId: row.id,
          key: s.key,
          idx,
          pos: s.pos,
          meaningVi: s.vi,
          definitionEn: s.en,
          collocations: s.collocations,
          example: s.example,
        };
        const sr = tx
          .insert(wordSenses)
          .values(sv)
          .onConflictDoUpdate({ target: [wordSenses.wordId, wordSenses.key], set: sv })
          .returning({ id: wordSenses.id })
          .get();
        senseIds.set(`${key}\u0000${s.key}`, sr.id);
        counts.senses++;
      });
      tx.delete(wordSenses)
        .where(
          and(
            eq(wordSenses.wordId, row.id),
            notInArray(
              wordSenses.key,
              entry.senses.map((s) => s.key),
            ),
          ),
        )
        .run();
    }

    tx.delete(wordForms).run();
    for (const [form, lemma] of bundle.lookup.forms) {
      tx.insert(wordForms)
        .values({ form, wordId: wordIds.get(lemma)! })
        .run();
      counts.forms++;
    }

    // --- Lessons ----------------------------------------------------------
    const lessonIds = new Map<string, number>();
    for (const p of bundle.lessons) {
      const l = p.lesson;
      const lv = {
        slug: p.slug,
        kind: l.kind,
        level: l.level,
        title: l.title,
        topic: l.topic,
        wordCount: p.wordCount,
        durationMs: null,
        audioPath: p.audioPath,
        coverPath: p.coverPath,
        orderIndex: l.order,
      };
      const lessonId = tx
        .insert(lessons)
        .values(lv)
        .onConflictDoUpdate({ target: lessons.slug, set: lv })
        .returning({ id: lessons.id })
        .get().id;
      lessonIds.set(p.slug, lessonId);
      counts.lessons++;

      // Tokens and focus words are rebuilt from scratch (nothing references them).
      tx.delete(lessonTokens).where(eq(lessonTokens.lessonId, lessonId)).run();
      tx.delete(lessonWords).where(eq(lessonWords.lessonId, lessonId)).run();

      const segIds = new Map<string, number>();
      l.segments.forEach((s, idx) => {
        const sv = {
          lessonId,
          key: s.id,
          idx,
          paragraphIdx: s.paragraph === undefined ? null : s.paragraph - 1,
          speaker: s.speaker ?? null,
          textEn: s.text_en,
          textVi: s.text_vi ?? null,
          startMs: s.start_ms ?? null,
          endMs: s.end_ms ?? null,
        };
        const segId = tx
          .insert(segments)
          .values(sv)
          .onConflictDoUpdate({ target: [segments.lessonId, segments.key], set: sv })
          .returning({ id: segments.id })
          .get().id;
        segIds.set(s.id, segId);
        counts.segments++;

        for (const t of p.tokens[idx] ?? []) {
          tx.insert(lessonTokens)
            .values({
              lessonId,
              segmentId: segId,
              idx: t.idx,
              surface: t.surface,
              startChar: t.start,
              endChar: t.end,
              wordId: wordIds.get(t.lemma)!,
              senseId: senseIds.get(`${t.lemma}\u0000${t.sense}`) ?? null,
            })
            .run();
          counts.tokens++;
        }
      });
      tx.delete(segments)
        .where(
          and(
            eq(segments.lessonId, lessonId),
            notInArray(
              segments.key,
              l.segments.map((s) => s.id),
            ),
          ),
        )
        .run();

      p.focus.forEach((f, idx) => {
        tx.insert(lessonWords)
          .values({
            lessonId,
            wordId: wordIds.get(f.lemma)!,
            senseId: senseIds.get(`${f.lemma}\u0000${f.sense}`) ?? null,
            idx,
          })
          .run();
        counts.focusWords++;
      });

      l.questions.forEach((q, idx) => {
        const qv = {
          lessonId,
          idx,
          prompt: q.prompt,
          options: q.options,
          correctIdx: q.correct,
          feedbackOk: q.feedback_ok ?? null,
          feedbackWrong: q.feedback_wrong ?? null,
          evidenceSegmentId: q.evidence === undefined ? null : segIds.get(q.evidence)!,
        };
        tx.insert(questions)
          .values(qv)
          .onConflictDoUpdate({ target: [questions.lessonId, questions.idx], set: qv })
          .run();
        counts.questions++;
      });
      tx.delete(questions)
        .where(
          and(eq(questions.lessonId, lessonId), sql`${questions.idx} >= ${l.questions.length}`),
        )
        .run();

      l.dictation.forEach((d, idx) => {
        const dv = {
          lessonId,
          idx,
          segmentId: segIds.get(d.segment)!,
          answer: d.answer,
          beforeText: d.before,
          afterText: d.after,
        };
        tx.insert(dictationItems)
          .values(dv)
          .onConflictDoUpdate({ target: [dictationItems.lessonId, dictationItems.idx], set: dv })
          .run();
        counts.dictation++;
      });
      tx.delete(dictationItems)
        .where(
          and(
            eq(dictationItems.lessonId, lessonId),
            sql`${dictationItems.idx} >= ${l.dictation.length}`,
          ),
        )
        .run();
    }
    const keepLessons = [...lessonIds.values()];
    tx.delete(lessons)
      .where(keepLessons.length ? notInArray(lessons.id, keepLessons) : sql`1 = 1`)
      .run();

    // --- Daily plan -------------------------------------------------------
    const days = bundle.dailyPlan?.days ?? [];
    for (const d of days) {
      const dv = {
        day: d.day,
        readingLessonId: d.reading ? lessonIds.get(d.reading)! : null,
        listeningLessonId: d.listening ? lessonIds.get(d.listening)! : null,
      };
      tx.insert(dailyPlansTemplate)
        .values(dv)
        .onConflictDoUpdate({ target: dailyPlansTemplate.day, set: dv })
        .run();
      counts.planDays++;
    }
    tx.delete(dailyPlansTemplate)
      .where(
        days.length
          ? notInArray(
              dailyPlansTemplate.day,
              days.map((d) => d.day),
            )
          : sql`1 = 1`,
      )
      .run();

    // --- Words removed from the dictionary ---------------------------------
    const keepWords = [...wordIds.values()];
    const stale = tx
      .select({ id: words.id, lemma: words.lemma })
      .from(words)
      .where(keepWords.length ? notInArray(words.id, keepWords) : sql`1 = 1`)
      .all();
    if (stale.length > 0) {
      const staleIds = stale.map((w) => w.id);
      const saved = tx
        .selectDistinct({ lemma: words.lemma })
        .from(userWords)
        .innerJoin(words, eq(words.id, userWords.wordId))
        .where(inArray(userWords.wordId, staleIds))
        .all();
      if (saved.length > 0) {
        throw new ContentSyncError(
          `cannot remove dictionary entries that a user has saved: ${saved.map((w) => w.lemma).join(', ')}. ` +
            'Keep their files in content/dictionary/.',
        );
      }
      tx.delete(words).where(inArray(words.id, staleIds)).run();
    }

    return counts;
  });
}

/** Validate `content/` and, unless `dryRun`, write it into the database. */
export function syncContent(opts: {
  contentDir: string;
  db?: AppDatabase;
  dryRun?: boolean;
}): SyncResult {
  const dryRun = opts.dryRun ?? false;
  const bundle = loadContent(opts.contentDir);
  if (hasErrors(bundle.issues)) return { ok: false, dryRun, issues: bundle.issues, counts: null };
  if (dryRun) return { ok: true, dryRun, issues: bundle.issues, counts: null };
  if (!opts.db) throw new Error('syncContent: db is required unless dryRun is set');
  try {
    const counts = writeBundle(opts.db, bundle);
    return { ok: true, dryRun, issues: bundle.issues, counts };
  } catch (err) {
    if (err instanceof ContentSyncError) {
      return {
        ok: false,
        dryRun,
        issues: [...bundle.issues, { level: 'error', file: 'database', message: err.message }],
        counts: null,
      };
    }
    throw err;
  }
}

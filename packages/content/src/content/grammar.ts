/**
 * Grammar points (`content/grammar/<slug>.yaml`) and the lesson sentences marked with them
 * (`grammar:` in lesson.yaml). Grammar plan sections 4 and 6.
 *
 * Checks that need several files (the single-file rules live in the Zod schemas):
 *  - every mark, pin and plan day points to an existing grammar point;
 *  - a pinned sentence is also marked with that point in its lesson (so it has ranges);
 *  - each plan day has at least `MIN_DAY_EXAMPLES` marked sentences in its own lessons.
 */
import {
  findGrammarMatch,
  GRAMMAR_PIN_PATTERN,
  type DailyPlanFile,
  type GrammarPointFile,
} from '@daily-learning/shared/content';
import type { ContentIssue, PreparedLesson } from './load.js';

export interface LoadedGrammar {
  slug: string;
  file: string;
  point: GrammarPointFile;
}

/** A lesson sentence marked with a grammar point (all marks of that sentence merged). */
export interface GrammarMark {
  point: string;
  lesson: PreparedLesson;
  /** Index in `lesson.lesson.segments`. */
  segmentIdx: number;
  segmentKey: string;
  /** Sorted, non-overlapping. */
  ranges: [number, number][];
  notes: string[];
}

/** Sentences of a day's own lessons needed for the "Nhận ra" step. */
export const MIN_DAY_EXAMPLES = 2;
/** Exercises per point (grammar plan 3.3). Outside this range: warning. */
export const EXERCISES_MIN = 6;
export const EXERCISES_MAX = 8;

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/**
 * Every marked sentence, one item per (lesson, segment, point), in lesson order then segment
 * order. Marks whose match is not found are skipped (the schema already reported them).
 */
export function collectGrammarMarks(lessons: readonly PreparedLesson[]): GrammarMark[] {
  const out: GrammarMark[] = [];
  for (const lesson of lessons) {
    const segIdx = new Map(lesson.lesson.segments.map((s, i) => [s.id, i]));
    const byKey = new Map<string, GrammarMark>();
    for (const g of lesson.lesson.grammar) {
      const idx = segIdx.get(g.segment);
      if (idx === undefined) continue;
      const ranges = findGrammarMatch(lesson.lesson.segments[idx]!.text_en, g.match);
      if (!ranges) continue;
      const key = `${g.segment}|${g.point}`;
      let mark = byKey.get(key);
      if (!mark) {
        mark = {
          point: g.point,
          lesson,
          segmentIdx: idx,
          segmentKey: g.segment,
          ranges: [],
          notes: [],
        };
        byKey.set(key, mark);
      }
      mark.ranges = mergeRanges([...mark.ranges, ...ranges]);
      if (g.note !== undefined) mark.notes.push(g.note);
    }
    out.push(
      ...[...byKey.values()].sort(
        (a, b) => a.segmentIdx - b.segmentIdx || a.point.localeCompare(b.point),
      ),
    );
  }
  return out;
}

/** Lesson slugs of each plan day that teaches `slug`. */
export function planDaysFor(
  plan: DailyPlanFile | null,
  slug: string,
): { day: number; lessons: string[] }[] {
  return (plan?.days ?? [])
    .filter((d) => d.grammar === slug)
    .map((d) => ({
      day: d.day,
      lessons: [d.reading, d.listening].filter((s): s is string => s !== undefined),
    }));
}

/** Cross-file checks for grammar points, lesson marks and the daily plan. */
export function checkGrammar(
  grammar: readonly LoadedGrammar[],
  lessons: readonly PreparedLesson[],
  plan: DailyPlanFile | null,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const known = new Map(grammar.map((g) => [g.slug, g]));
  const marks = collectGrammarMarks(lessons);

  for (const lesson of lessons) {
    lesson.lesson.grammar.forEach((g) => {
      if (!known.has(g.point)) {
        issues.push({
          level: 'error',
          file: lesson.file,
          message: `grammar: unknown grammar point "${g.point}" (segment ${g.segment}); add content/grammar/${g.point}.yaml`,
        });
      }
    });
  }

  const lessonBySlug = new Map(lessons.map((l) => [l.slug, l]));
  for (const g of grammar) {
    for (const pin of g.point.discover.pinned) {
      const [, lessonSlug, segment] = GRAMMAR_PIN_PATTERN.exec(pin)!;
      const lesson = lessonBySlug.get(lessonSlug!);
      if (!lesson || !lesson.lesson.segments.some((s) => s.id === segment)) {
        issues.push({
          level: 'error',
          file: g.file,
          message: `discover.pinned: "${pin}" is not a lesson sentence`,
        });
      } else if (
        !marks.some(
          (m) => m.point === g.slug && m.lesson.slug === lessonSlug && m.segmentKey === segment,
        )
      ) {
        issues.push({
          level: 'error',
          file: g.file,
          message: `discover.pinned: "${pin}" has no grammar mark for ${g.slug}; add it under grammar: in ${lesson.file}`,
        });
      }
    }
    const n = g.point.exercises.length;
    if (n < EXERCISES_MIN || n > EXERCISES_MAX) {
      issues.push({
        level: 'warning',
        file: g.file,
        message: `${n} exercises (plan: ${EXERCISES_MIN}–${EXERCISES_MAX})`,
      });
    }
    if (!marks.some((m) => m.point === g.slug)) {
      issues.push({
        level: 'warning',
        file: g.file,
        message: 'no lesson sentence is marked with this point: the "Nhận ra" step will be empty',
      });
    }
  }

  const planned = new Map<string, number>();
  for (const d of plan?.days ?? []) {
    if (d.grammar === undefined) continue;
    if (!known.has(d.grammar)) {
      issues.push({
        level: 'error',
        file: 'daily-plan.yaml',
        message: `day ${d.day}: unknown grammar point "${d.grammar}"`,
      });
      continue;
    }
    const other = planned.get(d.grammar);
    if (other !== undefined) {
      issues.push({
        level: 'warning',
        file: 'daily-plan.yaml',
        message: `day ${d.day}: grammar point "${d.grammar}" is already taught on day ${other}`,
      });
    } else planned.set(d.grammar, d.day);
    const dayLessons = new Set([d.reading, d.listening]);
    const count = marks.filter(
      (m) => m.point === d.grammar && dayLessons.has(m.lesson.slug),
    ).length;
    if (count < MIN_DAY_EXAMPLES) {
      issues.push({
        level: 'warning',
        file: 'daily-plan.yaml',
        message: `day ${d.day}: ${count} sentence(s) marked with ${d.grammar} in the day's lessons (need ${MIN_DAY_EXAMPLES})`,
      });
    }
  }
  return issues;
}

/**
 * Read and validate everything under `content/` without touching the database.
 * Used by `content:build` (and its `--check`), `content:check-dict` and `content:stats`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  dailyPlanSchema,
  dictionaryEntrySchema,
  lessonSchema,
  timingsSchema,
  type DailyPlanFile,
  type DictionaryEntry,
  type LessonFile,
  type TimingsFile,
} from '@daily-learning/shared/content';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { fileVersion, lessonTextHash, wordAudioPath } from './assets.js';
import {
  buildLookup,
  normalizeWord,
  splitWords,
  tokenizeLesson,
  type DictionaryLookup,
  type LessonToken,
} from './tokenizer.js';

export interface ContentIssue {
  level: 'error' | 'warning';
  /** Path relative to the content directory. */
  file: string;
  message: string;
}

export interface LoadedEntry {
  file: string;
  entry: DictionaryEntry;
  /** `words/<lemma-slug>.mp3` when that file exists (made by `content:tts-words`). */
  audioPath: string | null;
  audioVersion: string | null;
}

export interface FocusWord {
  lemma: string;
  sense: string;
}

export interface PreparedLesson {
  slug: string;
  file: string;
  lesson: LessonFile;
  wordCount: number;
  /** Paths relative to the content directory, or null when the file does not exist yet. */
  audioPath: string | null;
  /** Short hash of audio.mp3 (cache buster). */
  audioVersion: string | null;
  /** timings.json, when it exists and matches the lesson's segments. */
  timings: TimingsFile | null;
  coverPath: string | null;
  /** Tokens per segment (same order as `lesson.segments`). */
  tokens: LessonToken[][];
  focus: FocusWord[];
  missing: string[];
  ambiguous: string[];
}

export interface ContentBundle {
  contentDir: string;
  entries: LoadedEntry[];
  lookup: DictionaryLookup;
  lessons: PreparedLesson[];
  dailyPlan: DailyPlanFile | null;
  issues: ContentIssue[];
}

export function hasErrors(issues: readonly ContentIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

function readYaml(path: string): unknown {
  return parseYaml(readFileSync(path, 'utf8'), { uniqueKeys: true });
}

function formatZodError(err: z.ZodError): string[] {
  return err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}

function parseFile<T>(
  schema: z.ZodType<T>,
  path: string,
  rel: string,
  issues: ContentIssue[],
): T | null {
  let raw: unknown;
  try {
    raw = readYaml(path);
  } catch (err) {
    issues.push({ level: 'error', file: rel, message: `invalid YAML: ${(err as Error).message}` });
    return null;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const message of formatZodError(result.error))
      issues.push({ level: 'error', file: rel, message });
    return null;
  }
  return result.data;
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** Load and validate `content/dictionary/*.yaml`. */
export function loadDictionary(contentDir: string, issues: ContentIssue[]): LoadedEntry[] {
  const dir = join(contentDir, 'dictionary');
  if (!isDir(dir)) return [];
  const entries: LoadedEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.yaml')) continue;
    const rel = relative(contentDir, join(dir, name));
    const entry = parseFile(dictionaryEntrySchema, join(dir, name), rel, issues);
    if (!entry) continue;
    if (basename(name, '.yaml') !== entry.lemma) {
      issues.push({
        level: 'error',
        file: rel,
        message: `file name must be "${entry.lemma}.yaml" (same as lemma)`,
      });
      continue;
    }
    const audio = wordAudioPath(entry.lemma);
    const audioFile = join(contentDir, audio);
    const hasAudio = existsSync(audioFile);
    entries.push({
      file: rel,
      entry,
      audioPath: hasAudio ? audio : null,
      audioVersion: hasAudio ? fileVersion(audioFile) : null,
    });
  }
  return entries;
}

/** Folders `content/lessons/<level>/<slug>/` that contain a lesson.yaml. */
export function findLessonDirs(contentDir: string): string[] {
  const root = join(contentDir, 'lessons');
  if (!isDir(root)) return [];
  const out: string[] = [];
  for (const level of readdirSync(root).sort()) {
    const levelDir = join(root, level);
    if (!isDir(levelDir)) continue;
    for (const slug of readdirSync(levelDir).sort()) {
      const dir = join(levelDir, slug);
      if (isDir(dir) && existsSync(join(dir, 'lesson.yaml'))) out.push(dir);
    }
  }
  return out;
}

function prepareLesson(
  contentDir: string,
  dir: string,
  lookup: DictionaryLookup,
  issues: ContentIssue[],
): PreparedLesson | null {
  const slug = basename(dir);
  const rel = relative(contentDir, join(dir, 'lesson.yaml'));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    issues.push({
      level: 'error',
      file: rel,
      message: `folder name "${slug}" is not a valid slug (lowercase, digits, dashes)`,
    });
    return null;
  }
  const lesson = parseFile(lessonSchema, join(dir, 'lesson.yaml'), rel, issues);
  if (!lesson) return null;

  const texts = lesson.segments.map((s) => s.text_en);
  const result = tokenizeLesson(texts, { lookup, ignore: lesson.ignore, senses: lesson.senses });
  for (const message of result.errors) issues.push({ level: 'error', file: rel, message });
  for (const message of result.warnings) issues.push({ level: 'warning', file: rel, message });
  const missing = [...new Set(result.missing.map((m) => normalizeWord(m.surface)))];
  for (const m of result.missing) {
    const seg = lesson.segments[m.segment]!;
    issues.push({
      level: 'error',
      file: rel,
      message: `"${m.surface}" (segment ${seg.id}) is not in the dictionary; add content/dictionary/<lemma>.yaml or list it in ignore`,
    });
  }

  const firstToken = new Map<string, LessonToken>();
  for (const t of result.tokens.flat()) if (!firstToken.has(t.lemma)) firstToken.set(t.lemma, t);
  const focus: FocusWord[] = [];
  for (const word of lesson.focus_words) {
    const lemma = lookup.forms.get(normalizeWord(word).split(/\s+/).join(' '));
    if (lemma === undefined) {
      issues.push({
        level: 'error',
        file: rel,
        message: `focus word "${word}" is not in the dictionary`,
      });
      continue;
    }
    const token = firstToken.get(lemma);
    if (!token) {
      issues.push({
        level: 'error',
        file: rel,
        message: `focus word "${word}" does not appear in the lesson`,
      });
      continue;
    }
    if (focus.some((f) => f.lemma === lemma)) {
      issues.push({
        level: 'error',
        file: rel,
        message: `focus word "${word}" is listed twice (same lemma "${lemma}")`,
      });
      continue;
    }
    focus.push({ lemma, sense: token.sense });
  }
  if (focus.length < 6 || focus.length > 10) {
    issues.push({
      level: 'warning',
      file: rel,
      message: `${focus.length} focus words (plan: 6–10 per lesson)`,
    });
  }

  const asset = (name: string) =>
    existsSync(join(dir, name))
      ? relative(contentDir, join(dir, name)).split('\\').join('/')
      : null;
  const audioPath = asset('audio.mp3');
  return {
    slug,
    file: rel,
    lesson,
    wordCount: texts.reduce((n, t) => n + splitWords(t).length, 0),
    audioPath,
    audioVersion: audioPath ? fileVersion(join(contentDir, audioPath)) : null,
    timings: readTimings(contentDir, dir, slug, lesson, audioPath !== null, issues),
    coverPath: asset('cover.webp'),
    tokens: result.tokens,
    focus,
    missing,
    ambiguous: result.ambiguous,
  };
}

/**
 * Read `timings.json` next to a lesson. Problems are warnings: a lesson without (valid) timings
 * stays usable, it just has no per-segment seeking.
 */
function readTimings(
  contentDir: string,
  dir: string,
  slug: string,
  lesson: LessonFile,
  hasAudio: boolean,
  issues: ContentIssue[],
): TimingsFile | null {
  const path = join(dir, 'timings.json');
  const rel = relative(contentDir, path);
  const warn = (message: string) => issues.push({ level: 'warning', file: rel, message });
  if (!existsSync(path)) {
    if (hasAudio) warn(`audio.mp3 has no timings.json: run npm run content:tts -- ${slug} --force`);
    return null;
  }
  if (!hasAudio) {
    warn('timings.json without audio.mp3 (ignored)');
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    warn(`invalid JSON (ignored): ${(err as Error).message}`);
    return null;
  }
  const r = timingsSchema.safeParse(raw);
  if (!r.success) {
    warn(`invalid timings (ignored): ${formatZodError(r.error).join('; ')}`);
    return null;
  }
  const ids = lesson.segments.map((s) => s.id).join(',');
  if (r.data.segments.map((s) => s.id).join(',') !== ids) {
    warn(`segment ids differ from lesson.yaml (ignored): run npm run content:tts -- ${slug}`);
    return null;
  }
  if (r.data.textHash !== lessonTextHash(lesson.segments)) {
    warn(`lesson text changed after the audio was made: run npm run content:tts -- ${slug}`);
  }
  return r.data;
}

/** Load the whole content directory and collect every problem. */
export function loadContent(contentDir: string): ContentBundle {
  const issues: ContentIssue[] = [];
  const entries = loadDictionary(contentDir, issues);
  const built = buildLookup(entries.map((e) => e.entry));
  for (const message of built.errors) issues.push({ level: 'error', file: 'dictionary', message });

  const lessons: PreparedLesson[] = [];
  const seen = new Map<string, string>();
  for (const dir of findLessonDirs(contentDir)) {
    const prepared = prepareLesson(contentDir, dir, built.lookup, issues);
    if (!prepared) continue;
    const other = seen.get(prepared.slug);
    if (other) {
      issues.push({
        level: 'error',
        file: prepared.file,
        message: `slug "${prepared.slug}" is also used by ${other}`,
      });
      continue;
    }
    seen.set(prepared.slug, prepared.file);
    lessons.push(prepared);
  }

  let dailyPlan: DailyPlanFile | null = null;
  const planPath = join(contentDir, 'daily-plan.yaml');
  if (existsSync(planPath)) {
    dailyPlan = parseFile(dailyPlanSchema, planPath, 'daily-plan.yaml', issues);
    const kinds = new Map(lessons.map((l) => [l.slug, l.lesson.kind]));
    dailyPlan?.days.forEach((d) => {
      for (const kind of ['reading', 'listening'] as const) {
        const slug = d[kind];
        if (slug === undefined) continue;
        if (!kinds.has(slug)) {
          issues.push({
            level: 'error',
            file: 'daily-plan.yaml',
            message: `day ${d.day}: unknown lesson "${slug}"`,
          });
        } else if (kinds.get(slug) !== kind) {
          issues.push({
            level: 'error',
            file: 'daily-plan.yaml',
            message: `day ${d.day}: "${slug}" is not a ${kind} lesson`,
          });
        }
      }
    });
  }

  return { contentDir, entries, lookup: built.lookup, lessons, dailyPlan, issues };
}

/** Human-readable list of issues, errors first. */
export function formatIssues(issues: readonly ContentIssue[]): string {
  const sorted = [...issues].sort((a, b) =>
    a.level === b.level ? 0 : a.level === 'error' ? -1 : 1,
  );
  return sorted
    .map((i) => `${i.level === 'error' ? 'ERROR' : 'warn '} ${i.file}: ${i.message}`)
    .join('\n');
}

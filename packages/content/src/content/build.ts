/**
 * `content:build`: turn a validated `content/` bundle into the static files the web app reads
 * (`/content/data/*.json`, see `@daily-learning/shared/content-data`) and copy the media files
 * (lesson audio, covers, word audio) next to them.
 *
 * Ids are hashes of natural keys, so they do not depend on build order and stay the same as long
 * as the lemma / slug / key stays the same. A hash collision fails the build.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { SegmentDto, TokenDto } from '@daily-learning/shared/api';
import {
  CONTENT_DATA_PREFIX,
  type CatalogLesson,
  type CatalogWord,
  type ContentCatalog,
  type ExamplesData,
  type LessonData,
  type WordExample,
} from '@daily-learning/shared/content-data';
import type { ContentBundle } from './load.js';
import { normalizeWord } from './tokenizer.js';

/** URL prefix under which `content/` media files are served. */
export const CONTENT_PREFIX = '/content';

export interface BuiltContent {
  catalog: ContentCatalog;
  lessons: LessonData[];
  examples: ExamplesData;
}

/** Public URL of a file under `content/`, with `?v=<hash>` so it can be cached forever. */
export function contentUrl(path: string | null, version: string | null): string | null {
  if (!path) return null;
  const url = `${CONTENT_PREFIX}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return version ? `${url}?v=${version}` : url;
}

/** Positive integer below 2^48 (safe in JSON and JavaScript) from a natural key. */
export function hashId(...parts: (string | number)[]): number {
  const hex = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 12);
  return Number.parseInt(hex, 16) || 1;
}

export function wordId(lemma: string): number {
  return hashId('word', lemma);
}
export function senseId(lemma: string, key: string): number {
  return hashId('sense', lemma, key);
}
export function lessonId(slug: string): number {
  return hashId('lesson', slug);
}
export function segmentId(slug: string, key: string): number {
  return hashId('segment', slug, key);
}
export function questionId(slug: string, idx: number): number {
  return hashId('question', slug, idx);
}
export function dictationId(slug: string, idx: number): number {
  return hashId('dictation', slug, idx);
}

class IdRegistry {
  private seen = new Map<number, string>();
  add(id: number, label: string): number {
    const other = this.seen.get(id);
    if (other !== undefined && other !== label) {
      throw new Error(`id collision between ${other} and ${label}: rename one of them`);
    }
    this.seen.set(id, label);
    return id;
  }
}

const levelOrder = (l: string) => ['A2', 'A2+', 'B1'].indexOf(l);

/** Build the JSON data from a bundle without errors (see `hasErrors`). */
export function buildContentData(bundle: ContentBundle): BuiltContent {
  const ids = new IdRegistry();

  // --- Dictionary -------------------------------------------------------
  const lemmaByKey = new Map<string, string>(); // normalized lemma → lemma
  const words: CatalogWord[] = [];
  for (const { entry, audioPath, audioVersion } of bundle.entries) {
    lemmaByKey.set(normalizeWord(entry.lemma), entry.lemma);
    words.push({
      id: ids.add(wordId(entry.lemma), `word "${entry.lemma}"`),
      lemma: entry.lemma,
      ipaUs: entry.ipa_us,
      cefr: entry.cefr,
      oxford3000: entry.oxford3000,
      isPhrase: entry.is_phrase,
      status: entry.status,
      audioUrl: contentUrl(audioPath, audioVersion),
      senses: entry.senses.map((s) => ({
        id: ids.add(senseId(entry.lemma, s.key), `sense "${entry.lemma}#${s.key}"`),
        key: s.key,
        pos: s.pos,
        meaningVi: s.vi,
        definitionEn: s.en,
        collocations: s.collocations,
        example: s.example,
      })),
    });
  }
  words.sort((a, b) => (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0));
  const lemmaOf = (key: string) => {
    const lemma = lemmaByKey.get(key);
    if (lemma === undefined) throw new Error(`unknown lemma key "${key}"`);
    return lemma;
  };

  // --- Lessons ----------------------------------------------------------
  const prepared = [...bundle.lessons].sort(
    (a, b) =>
      levelOrder(a.lesson.level) - levelOrder(b.lesson.level) ||
      a.lesson.order - b.lesson.order ||
      a.lesson.title.localeCompare(b.lesson.title) ||
      a.slug.localeCompare(b.slug),
  );
  const lessons: CatalogLesson[] = [];
  const lessonData: LessonData[] = [];
  const byWord = new Map<number, WordExample[]>();

  for (const p of prepared) {
    const l = p.lesson;
    const id = ids.add(lessonId(p.slug), `lesson "${p.slug}"`);
    const audioUrl = contentUrl(p.audioPath, p.audioVersion);
    lessons.push({
      id,
      slug: p.slug,
      kind: l.kind,
      level: l.level,
      title: l.title,
      topic: l.topic,
      wordCount: p.wordCount,
      durationMs: p.timings?.durationMs ?? null,
      audioUrl,
      orderIndex: l.order,
    });

    const timing = new Map(p.timings?.segments.map((t) => [t.id, t]));
    const segIds = new Map<string, number>();
    const usedWords = new Set<number>();
    /** (word, sense) pairs already given an example from this lesson. */
    const exampleKeys = new Set<string>();
    const segments: SegmentDto[] = l.segments.map((s, idx) => {
      const sid = ids.add(segmentId(p.slug, s.id), `segment "${p.slug}/${s.id}"`);
      segIds.set(s.id, sid);
      const startMs = timing.get(s.id)?.startMs ?? s.start_ms ?? null;
      const endMs = timing.get(s.id)?.endMs ?? s.end_ms ?? null;
      const tokens: TokenDto[] = (p.tokens[idx] ?? []).map((t) => {
        const lemma = lemmaOf(t.lemma);
        const wid = wordId(lemma);
        const sense = t.sense ? senseId(lemma, t.sense) : null;
        usedWords.add(wid);
        if (audioUrl && startMs !== null && endMs !== null) {
          const key = `${wid}:${sense}`;
          if (!exampleKeys.has(key)) {
            exampleKeys.add(key);
            const list = byWord.get(wid) ?? [];
            list.push({
              lessonId: id,
              senseId: sense,
              textEn: s.text_en,
              audioUrl,
              startMs,
              endMs,
            });
            byWord.set(wid, list);
          }
        }
        return {
          idx: t.idx,
          surface: t.surface,
          start: t.start,
          end: t.end,
          wordId: wid,
          senseId: sense,
        };
      });
      return {
        id: sid,
        key: s.id,
        idx,
        paragraphIdx: s.paragraph === undefined ? null : s.paragraph - 1,
        speaker: s.speaker ?? null,
        textEn: s.text_en,
        textVi: s.text_vi ?? null,
        startMs,
        endMs,
        tokens,
      };
    });

    const focusWords = p.focus.map((f) => {
      const lemma = lemmaOf(f.lemma);
      const wid = wordId(lemma);
      usedWords.add(wid);
      return { wordId: wid, senseId: f.sense ? senseId(lemma, f.sense) : null };
    });

    lessonData.push({
      slug: p.slug,
      segments,
      focusWords,
      questions: l.questions.map((q, idx) => ({
        id: ids.add(questionId(p.slug, idx), `question "${p.slug}#${idx}"`),
        idx,
        prompt: q.prompt,
        options: q.options,
        evidenceSegmentId: q.evidence === undefined ? null : segIds.get(q.evidence)!,
        correctIdx: q.correct,
        feedbackOk: q.feedback_ok ?? null,
        feedbackWrong: q.feedback_wrong ?? null,
      })),
      dictation: l.dictation.map((d, idx) => ({
        id: ids.add(dictationId(p.slug, idx), `dictation "${p.slug}#${idx}"`),
        idx,
        segmentId: segIds.get(d.segment)!,
        beforeText: d.before,
        afterText: d.after,
        answer: d.answer,
      })),
      peaks: p.audioPath ? (p.timings?.peaks ?? null) : null,
      wordIds: [...usedWords].sort((a, b) => a - b),
    });
  }

  const plan = [...(bundle.dailyPlan?.days ?? [])]
    .sort((a, b) => a.day - b.day)
    .map((d) => ({
      day: d.day,
      title: d.title ?? null,
      reading: d.reading ?? null,
      listening: d.listening ?? null,
    }));

  const body = { lessons, words, plan };
  const version = createHash('sha256')
    .update(JSON.stringify([body, lessonData]))
    .digest('hex')
    .slice(0, 12);
  const examples: ExamplesData = {
    version,
    byWord: Object.fromEntries([...byWord].sort((a, b) => a[0] - b[0])),
  };
  return { catalog: { version, ...body }, lessons: lessonData, examples };
}

/** Relative path (under the output dir) of each JSON file, as served under `/content/data`. */
export function dataFiles(built: BuiltContent): Map<string, unknown> {
  const files = new Map<string, unknown>();
  files.set('catalog.json', built.catalog);
  files.set('examples.json', built.examples);
  for (const l of built.lessons) files.set(`lessons/${l.slug}.json`, l);
  return files;
}

/** Media files that may be published (never YAML, caches or dotfiles). */
const MEDIA =
  /^(?:lessons\/[^/]+\/[^/]+\/(?:audio\.mp3|cover\.(?:webp|png|jpe?g))|words\/[a-z0-9-]+\.mp3)$/;

export function isPublicMediaPath(rel: string): boolean {
  if (rel.split('/').some((part) => part.startsWith('.'))) return false;
  return MEDIA.test(rel);
}

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path, base));
    else out.push(relative(base, path).split('\\').join('/'));
  }
  return out;
}

export interface WriteResult {
  dataFiles: number;
  mediaCopied: number;
  mediaKept: number;
  removed: number;
}

/**
 * Write `<outDir>/data/**.json` and copy media into `<outDir>/` (same paths as in `content/`).
 * Media whose size and mtime did not change are not copied again; files that are no longer part
 * of the content are removed, so `outDir` can be published as is.
 */
export function writeContentOutput(
  built: BuiltContent,
  contentDir: string,
  outDir: string,
): WriteResult {
  const result: WriteResult = { dataFiles: 0, mediaCopied: 0, mediaKept: 0, removed: 0 };
  const wanted = new Set<string>();

  const dataDir = CONTENT_DATA_PREFIX.slice(CONTENT_PREFIX.length + 1); // "data"
  for (const [rel, value] of dataFiles(built)) {
    const target = `${dataDir}/${rel}`;
    wanted.add(target);
    const path = join(outDir, target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    result.dataFiles++;
  }

  for (const rel of listFiles(contentDir).filter(isPublicMediaPath)) {
    wanted.add(rel);
    const src = join(contentDir, rel);
    const dest = join(outDir, rel);
    const s = statSync(src);
    if (existsSync(dest)) {
      const d = statSync(dest);
      if (d.size === s.size && d.mtimeMs >= s.mtimeMs) {
        result.mediaKept++;
        continue;
      }
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    result.mediaCopied++;
  }

  for (const rel of listFiles(outDir)) {
    if (wanted.has(rel)) continue;
    rmSync(join(outDir, rel));
    result.removed++;
  }
  return result;
}

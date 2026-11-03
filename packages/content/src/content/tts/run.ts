/**
 * The two TTS jobs (plan 2.4, Phase 3):
 *  - `runLessonTts`: one clip per segment (speaker A/B voice for listening, narrator for
 *    reading) → ffmpeg concat with `gapMs` silence → `audio.mp3` + `timings.json`.
 *  - `runWordTts`: one clip per dictionary lemma without audio → `content/words/<slug>.mp3`.
 *
 * Both share the clip cache and the `TTS_MAX_CHARS` limit, and support a dry run that only
 * counts characters (no API key, no ffmpeg, no network).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { LessonFile, TimingsFile, TtsConfig } from '@daily-learning/shared/content';
import { timingsSchema } from '@daily-learning/shared/content';
import { lessonTextHash, wordAudioPath } from '../assets.js';
import { formatIssues, hasErrors, loadContent } from '../load.js';
import { clipKey, TtsCache } from './cache.js';
import { checkVoices, loadTtsConfig } from './config.js';
import {
  assertFfmpeg,
  computePeaks,
  concatToMp3,
  normalizeMp3,
  probeDurationMs,
  silenceWav,
  toWav,
} from './ffmpeg.js';
import type { TtsProvider } from './provider.js';
import { TIER_FEATURES, voiceTier, type VoiceTier } from './voices.js';

export const DEFAULT_MAX_CHARS = 50000;
export const PEAK_BARS = 80;

export class TtsLimitError extends Error {}

export interface ClipJob {
  key: string;
  text: string;
  voice: string;
  tier: VoiceTier;
  speakingRate: number | undefined;
}

export interface TtsRunOptions {
  contentDir: string;
  provider: TtsProvider;
  dryRun?: boolean;
  force?: boolean;
  /** Abort before any API call when more characters than this would be sent. */
  maxChars?: number;
  log?: (line: string) => void;
}

export interface TtsRunResult {
  /** Characters of every clip the selected items need. */
  totalChars: number;
  /** Characters that are not cached and would be (or were) sent to the API. */
  charsToSend: number;
  clipsToSend: number;
  /** Lesson slugs or word lemmas written (empty for a dry run). */
  written: string[];
  skipped: string[];
}

export function makeJob(text: string, voice: string, config: TtsConfig, provider: string): ClipJob {
  const tier = voiceTier(voice);
  if (!tier) throw new Error(`voice "${voice}" is not a Chirp3-HD, Neural2 or WaveNet voice`);
  const speakingRate = TIER_FEATURES[tier].speakingRate ? config.speakingRate : undefined;
  return {
    key: clipKey({ provider, text, voice, speakingRate, tier }),
    text,
    voice,
    tier,
    speakingRate,
  };
}

/** Voice of one lesson segment. */
export function segmentVoice(
  lesson: Pick<LessonFile, 'kind'>,
  speaker: 'A' | 'B' | undefined,
  config: TtsConfig,
): string {
  if (lesson.kind === 'reading') return config.narrator;
  return speaker === 'B' ? config.speakerB : config.speakerA;
}

/** Unique uncached jobs and their character count. */
function pending(jobs: readonly ClipJob[], cache: TtsCache) {
  const unique = new Map<string, ClipJob>();
  for (const j of jobs) if (!cache.has(j.key)) unique.set(j.key, j);
  const list = [...unique.values()];
  return { list, chars: list.reduce((n, j) => n + j.text.length, 0) };
}

async function prepareRun(
  opts: TtsRunOptions,
  jobs: readonly ClipJob[],
  cache: TtsCache,
  what: string,
): Promise<{ list: ClipJob[]; chars: number; total: number } | null> {
  const log = opts.log ?? (() => {});
  const total = jobs.reduce((n, j) => n + j.text.length, 0);
  const todo = pending(jobs, cache);
  const max = opts.maxChars ?? DEFAULT_MAX_CHARS;
  log(
    `${what}: ${jobs.length} clip(s), ${total} characters; not cached: ${todo.list.length} clip(s), ` +
      `${todo.chars} characters to send to ${opts.provider.name} (limit TTS_MAX_CHARS=${max}).`,
  );
  if (opts.dryRun) return null;
  if (todo.chars > max) {
    throw new TtsLimitError(
      `${todo.chars} characters would be sent, more than TTS_MAX_CHARS=${max}. ` +
        'Nothing was sent. Run fewer lessons at once or raise TTS_MAX_CHARS in .env.',
    );
  }
  assertFfmpeg();
  if (todo.list.length > 0) {
    const errors = checkVoices(
      todo.list.map((j) => j.voice),
      await opts.provider.listVoices('en-US'),
    );
    if (errors.length > 0) throw new Error(errors.join('\n'));
  }
  return { ...todo, total };
}

async function fetchClips(
  provider: TtsProvider,
  cache: TtsCache,
  list: readonly ClipJob[],
  log: (line: string) => void,
) {
  let done = 0;
  for (const j of list) {
    const audio = await provider.synthesize({
      text: j.text,
      voice: j.voice,
      tier: j.tier,
      speakingRate: j.speakingRate,
    });
    cache.put(j.key, audio, { provider: provider.name, voice: j.voice, chars: j.text.length });
    done++;
    if (done % 10 === 0 || done === list.length) log(`  synthesized ${done}/${list.length}`);
  }
}

/** Write a file atomically (temp file in the same directory, then rename). */
function replaceFile(target: string, write: (tmp: string) => Promise<void> | void) {
  const tmp = join(dirname(target), `.${Date.now()}.tmp${target.slice(target.lastIndexOf('.'))}`);
  return Promise.resolve(write(tmp)).then(
    () => renameSync(tmp, target),
    (err: unknown) => {
      rmSync(tmp, { force: true });
      throw err;
    },
  );
}

/** Concatenate a lesson's clips into audio.mp3 and write timings.json. */
export async function buildLessonAudio(opts: {
  lessonDir: string;
  segments: readonly { id: string; speaker?: 'A' | 'B'; text_en: string }[];
  jobs: readonly ClipJob[];
  cache: TtsCache;
  gapMs: number;
}): Promise<TimingsFile> {
  const work = mkdtempSync(join(tmpdir(), 'dl-tts-'));
  try {
    const parts: string[] = [];
    const durations: number[] = [];
    for (const [i, job] of opts.jobs.entries()) {
      const wav = join(work, `${String(i).padStart(4, '0')}.wav`);
      await toWav(opts.cache.clipPath(job.key), wav);
      durations.push(await probeDurationMs(wav));
      parts.push(wav);
    }
    let gap = 0;
    const list: string[] = [];
    if (opts.gapMs > 0 && parts.length > 1) {
      const gapWav = join(work, 'gap.wav');
      await silenceWav(opts.gapMs, gapWav);
      gap = await probeDurationMs(gapWav);
      parts.forEach((p, i) => list.push(...(i > 0 ? [gapWav, p] : [p])));
    } else {
      list.push(...parts);
    }

    let t = 0;
    const segments = opts.segments.map((s, i) => {
      const start = t;
      const end = start + durations[i]!;
      t = end + gap;
      return { id: s.id, startMs: Math.round(start), endMs: Math.round(end) };
    });

    const audioPath = join(opts.lessonDir, 'audio.mp3');
    await replaceFile(audioPath, (tmp) => concatToMp3(list, tmp, work));
    const timings: TimingsFile = timingsSchema.parse({
      version: 1,
      durationMs: Math.round(await probeDurationMs(audioPath)),
      textHash: lessonTextHash(opts.segments),
      segments,
      peaks: await computePeaks(audioPath, PEAK_BARS),
    });
    writeFileSync(join(opts.lessonDir, 'timings.json'), JSON.stringify(timings, null, 2) + '\n');
    return timings;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function readTextHash(lessonDir: string): string | null {
  const path = join(lessonDir, 'timings.json');
  if (!existsSync(path) || !existsSync(join(lessonDir, 'audio.mp3'))) return null;
  try {
    return timingsSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).textHash;
  } catch {
    return null;
  }
}

/** `content:tts <slug…|--all>` */
export async function runLessonTts(
  opts: TtsRunOptions & { slugs: readonly string[] | 'all' },
): Promise<TtsRunResult> {
  const log = opts.log ?? (() => {});
  const bundle = loadContent(opts.contentDir);
  if (hasErrors(bundle.issues)) {
    throw new Error(`content/ has errors, fix them first:\n${formatIssues(bundle.issues)}`);
  }
  const config = loadTtsConfig(opts.contentDir);
  let lessons = bundle.lessons;
  if (opts.slugs !== 'all') {
    const known = new Map(lessons.map((l) => [l.slug, l]));
    const unknown = opts.slugs.filter((s) => !known.has(s));
    if (unknown.length > 0) {
      throw new Error(
        `unknown lesson(s): ${unknown.join(', ')}. Known: ${[...known.keys()].join(', ')}`,
      );
    }
    lessons = opts.slugs.map((s) => known.get(s)!);
  }

  const cache = new TtsCache(opts.contentDir);
  const targets: { slug: string; dir: string; lesson: LessonFile; jobs: ClipJob[] }[] = [];
  const skipped: string[] = [];
  for (const p of lessons) {
    const dir = join(opts.contentDir, dirname(p.file));
    if (!opts.force && readTextHash(dir) === lessonTextHash(p.lesson.segments)) {
      skipped.push(p.slug);
      log(`${p.slug}: audio is up to date (use --force to regenerate, e.g. after changing voices)`);
      continue;
    }
    const jobs = p.lesson.segments.map((s) =>
      makeJob(s.text_en, segmentVoice(p.lesson, s.speaker, config), config, opts.provider.name),
    );
    targets.push({ slug: p.slug, dir, lesson: p.lesson, jobs });
  }

  const allJobs = targets.flatMap((t) => t.jobs);
  const run = await prepareRun(opts, allJobs, cache, `content:tts (${targets.length} lesson(s))`);
  const todo = pending(allJobs, cache);
  const result: TtsRunResult = {
    totalChars: allJobs.reduce((n, j) => n + j.text.length, 0),
    charsToSend: todo.chars,
    clipsToSend: todo.list.length,
    written: [],
    skipped,
  };
  if (!run) return result;

  await fetchClips(opts.provider, cache, run.list, log);
  for (const t of targets) {
    const timings = await buildLessonAudio({
      lessonDir: t.dir,
      segments: t.lesson.segments,
      jobs: t.jobs,
      cache,
      gapMs: config.gapMs,
    });
    result.written.push(t.slug);
    log(`${t.slug}: audio.mp3 (${(timings.durationMs / 1000).toFixed(1)} s) + timings.json`);
  }
  return result;
}

/** `content:tts-words`: pronunciation for every dictionary lemma without `words/<slug>.mp3`. */
export async function runWordTts(
  opts: TtsRunOptions & { lemmas?: readonly string[] },
): Promise<TtsRunResult> {
  const log = opts.log ?? (() => {});
  const bundle = loadContent(opts.contentDir);
  const dictErrors = bundle.issues.filter(
    (i) => i.level === 'error' && i.file.startsWith('dictionary'),
  );
  if (dictErrors.length > 0) {
    throw new Error(`content/dictionary has errors, fix them first:\n${formatIssues(dictErrors)}`);
  }
  const config = loadTtsConfig(opts.contentDir);
  let entries = bundle.entries.map((e) => e.entry);
  if (opts.lemmas) {
    const wanted = new Set(opts.lemmas);
    entries = entries.filter((e) => wanted.has(e.lemma));
  }

  // Phrase slugs must stay unique once punctuation and case are dropped.
  const bySlug = new Map<string, string>();
  for (const e of bundle.entries) {
    const rel = wordAudioPath(e.entry.lemma);
    const other = bySlug.get(rel);
    if (other) throw new Error(`"${e.entry.lemma}" and "${other}" both map to ${rel}`);
    bySlug.set(rel, e.entry.lemma);
  }

  const cache = new TtsCache(opts.contentDir);
  const targets: { lemma: string; out: string; job: ClipJob }[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    const out = join(opts.contentDir, wordAudioPath(e.lemma));
    if (!opts.force && existsSync(out)) {
      skipped.push(e.lemma);
      continue;
    }
    targets.push({
      lemma: e.lemma,
      out,
      job: makeJob(e.lemma, config.word, config, opts.provider.name),
    });
  }
  if (skipped.length > 0) log(`${skipped.length} word(s) already have audio (use --force to redo)`);

  const jobs = targets.map((t) => t.job);
  const run = await prepareRun(opts, jobs, cache, `content:tts-words (${targets.length} word(s))`);
  const todo = pending(jobs, cache);
  const result: TtsRunResult = {
    totalChars: jobs.reduce((n, j) => n + j.text.length, 0),
    charsToSend: todo.chars,
    clipsToSend: todo.list.length,
    written: [],
    skipped,
  };
  if (!run) return result;

  await fetchClips(opts.provider, cache, run.list, log);
  if (targets.length > 0) mkdirSync(join(opts.contentDir, 'words'), { recursive: true });
  for (const t of targets) {
    await replaceFile(t.out, (tmp) => normalizeMp3(cache.clipPath(t.job.key), tmp));
    result.written.push(t.lemma);
  }
  if (targets.length > 0) log(`wrote ${targets.length} file(s) in content/words/`);
  return result;
}

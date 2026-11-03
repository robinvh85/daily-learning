/**
 * End-to-end audio pipeline with the fake provider (ffmpeg tones) on a temp copy of content/:
 * content:tts → audio.mp3 + timings.json, content:tts-words, cache, limits and content:build.
 * Skipped when ffmpeg is not installed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingsSchema } from '@daily-learning/shared/content';
import type { LessonData } from '@daily-learning/shared/content-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../src/config.js';
import { wordAudioSlug } from '../src/content/assets.js';
import { loadContent } from '../src/content/load.js';
import { buildContentData, isPublicMediaPath, writeContentOutput } from '../src/content/build.js';
import { CACHE_FILE, CLIPS_DIR } from '../src/content/tts/cache.js';
import { createFakeProvider, fakeDurationMs } from '../src/content/tts/fake.js';
import { hasFfmpeg, probeDurationMs } from '../src/content/tts/ffmpeg.js';
import { runLessonTts, runWordTts, TtsLimitError } from '../src/content/tts/run.js';

const LISTENING = 'lessons/a2/at-the-train-station';

describe('wordAudioSlug', () => {
  it('makes phrase and contraction slugs filename-safe', () => {
    expect(wordAudioSlug("I'm afraid")).toBe('i-m-afraid');
    expect(wordAudioSlug('bus stop')).toBe('bus-stop');
    expect(wordAudioSlug("it's")).toBe('it-s');
    expect(wordAudioSlug('Saturday')).toBe('saturday');
    expect(wordAudioSlug('café')).toBe('cafe');
    expect(() => wordAudioSlug("'")).toThrow();
  });

  it('gives every dictionary lemma a unique file name', () => {
    const lemmas = loadContent(join(ROOT_DIR, 'content')).entries.map((e) => e.entry.lemma);
    const slugs = lemmas.map(wordAudioSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe.skipIf(!hasFfmpeg())('TTS pipeline (fake provider)', () => {
  let tmp: string;
  let contentDir: string;
  const provider = createFakeProvider();

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dl-tts-'));
    contentDir = join(tmp, 'content');
    cpSync(join(ROOT_DIR, 'content'), contentDir, {
      recursive: true,
      // Start without any generated audio (the repository has some by now).
      filter: (src) =>
        !src.includes(CLIPS_DIR) &&
        !src.endsWith(CACHE_FILE) &&
        !src.endsWith('.mp3') &&
        !src.endsWith('timings.json'),
    });
  });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('dry run counts characters without calling the provider', async () => {
    const r = await runLessonTts({ contentDir, provider, slugs: 'all', dryRun: true });
    expect(r.charsToSend).toBeGreaterThan(500);
    expect(r.charsToSend).toBe(r.totalChars);
    expect(r.written).toEqual([]);
    expect(provider.calls).toBe(0);
    expect(existsSync(join(contentDir, LISTENING, 'audio.mp3'))).toBe(false);
  });

  it('aborts before any call above the character limit', async () => {
    await expect(
      runLessonTts({ contentDir, provider, slugs: 'all', maxChars: 100 }),
    ).rejects.toBeInstanceOf(TtsLimitError);
    expect(provider.calls).toBe(0);
  });

  it('rejects unknown slugs', async () => {
    await expect(runLessonTts({ contentDir, provider, slugs: ['nope'] })).rejects.toThrow(
      /unknown lesson/,
    );
  });

  it('writes audio.mp3 and timings.json whose offsets match the audio', async () => {
    const r = await runLessonTts({ contentDir, provider, slugs: ['at-the-train-station'] });
    expect(r.written).toEqual(['at-the-train-station']);
    const dir = join(contentDir, LISTENING);
    const timings = timingsSchema.parse(
      JSON.parse(readFileSync(join(dir, 'timings.json'), 'utf8')),
    );
    const lesson = loadContent(contentDir).lessons.find((l) => l.slug === 'at-the-train-station')!;
    expect(provider.calls).toBe(lesson.lesson.segments.length);

    // Durations come from the real clips (fake: ~55 ms per character) and gaps are 400 ms.
    timings.segments.forEach((s, i) => {
      const seg = lesson.lesson.segments[i]!;
      expect(s.id).toBe(seg.id);
      expect(Math.abs(s.endMs - s.startMs - fakeDurationMs(seg.text_en))).toBeLessThan(80);
      if (i > 0) expect(s.startMs - timings.segments[i - 1]!.endMs).toBeCloseTo(400, -1);
    });
    const audio = join(dir, 'audio.mp3');
    const probed = await probeDurationMs(audio);
    expect(Math.abs(timings.durationMs - probed)).toBeLessThan(1);
    expect(Math.abs(timings.durationMs - timings.segments.at(-1)!.endMs)).toBeLessThan(100);

    // The silences ffmpeg detects in the final file are exactly the gaps between segments.
    const detect = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-i', audio, '-af', 'silencedetect=noise=-45dB:d=0.25', '-f', 'null', '-'],
      { encoding: 'utf8' },
    );
    const stderr = detect.stderr;
    const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
    const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
    expect(starts).toHaveLength(timings.segments.length - 1);
    starts.forEach((t, i) => {
      expect(Math.abs(t - timings.segments[i]!.endMs)).toBeLessThan(60);
      expect(Math.abs(ends[i]! - timings.segments[i + 1]!.startMs)).toBeLessThan(60);
    });

    // MP3 mono 64 kbps.
    const info = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=channels,bit_rate,codec_name', '-of', 'json', audio],
      { encoding: 'utf8' },
    );
    const stream = (JSON.parse(info) as { streams: Record<string, unknown>[] }).streams[0]!;
    expect(stream).toMatchObject({ codec_name: 'mp3', channels: 1, bit_rate: '64000' });

    expect(timings.peaks).toHaveLength(80);
    expect(Math.max(...timings.peaks)).toBe(1);
    expect(timings.peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
  });

  it('skips up-to-date lessons and reuses cached clips with --force', async () => {
    const before = provider.calls;
    const again = await runLessonTts({ contentDir, provider, slugs: ['at-the-train-station'] });
    expect(again.skipped).toEqual(['at-the-train-station']);
    const forced = await runLessonTts({
      contentDir,
      provider,
      slugs: ['at-the-train-station'],
      force: true,
    });
    expect(forced.written).toEqual(['at-the-train-station']);
    expect(forced.charsToSend).toBe(0);
    expect(provider.calls).toBe(before);
    expect(existsSync(join(contentDir, CACHE_FILE))).toBe(true);
  });

  it('regenerates only changed segments after a text edit', async () => {
    const file = join(contentDir, LISTENING, 'lesson.yaml');
    // Punctuation-only edit: the lesson still validates, one segment text changes.
    writeFileSync(file, readFileSync(file, 'utf8').replace('Oh no.', 'Oh no!'));
    const before = provider.calls;
    // Only the two lessons that already have audio, to keep the test fast as content grows.
    const r = await runLessonTts({
      contentDir,
      provider,
      slugs: ['a-new-coffee-shop', 'at-the-train-station'],
    });
    expect(r.written.sort()).toEqual(['a-new-coffee-shop', 'at-the-train-station']);
    const reading = loadContent(contentDir).lessons.find((l) => l.slug === 'a-new-coffee-shop')!;
    expect(provider.calls - before).toBe(reading.lesson.segments.length + 1);
  });

  it('generates word audio for lemmas without it', async () => {
    const dry = await runWordTts({ contentDir, provider, dryRun: true });
    expect(dry.clipsToSend).toBe(loadContent(contentDir).entries.length);
    const r = await runWordTts({ contentDir, provider, lemmas: ["I'm afraid", 'platform'] });
    expect(r.written.sort()).toEqual(["I'm afraid", 'platform']);
    expect(existsSync(join(contentDir, 'words/i-m-afraid.mp3'))).toBe(true);
    const again = await runWordTts({ contentDir, provider, lemmas: ['platform'] });
    expect(again.skipped).toEqual(['platform']);
    await expect(runWordTts({ contentDir, provider, maxChars: 10 })).rejects.toBeInstanceOf(
      TtsLimitError,
    );
  });

  it('builds timings, peaks and word audio into the web files, and copies only public media', () => {
    const bundle = loadContent(contentDir);
    expect(bundle.issues).toEqual([]);
    const built = buildContentData(bundle);
    const out = join(tmp, 'out');
    writeContentOutput(built, contentDir, out);

    const detail = JSON.parse(
      readFileSync(join(out, 'data/lessons/at-the-train-station.json'), 'utf8'),
    ) as LessonData;
    const lesson = built.catalog.lessons.find((l) => l.slug === 'at-the-train-station')!;
    const timings = timingsSchema.parse(
      JSON.parse(readFileSync(join(contentDir, LISTENING, 'timings.json'), 'utf8')),
    );
    expect(lesson.durationMs).toBe(timings.durationMs);
    expect(lesson.audioUrl).toMatch(
      /^\/content\/lessons\/a2\/at-the-train-station\/audio\.mp3\?v=[0-9a-f]{10}$/,
    );
    expect(detail.peaks).toEqual(timings.peaks);
    expect(detail.segments.map((s) => [s.key, s.startMs, s.endMs])).toEqual(
      timings.segments.map((s) => [s.id, s.startMs, s.endMs]),
    );
    const word = (lemma: string) => built.catalog.words.find((w) => w.lemma === lemma)!;
    expect(word('platform').audioUrl).toMatch(/^\/content\/words\/platform\.mp3\?v=/);
    expect(word('train').audioUrl).toBeNull();

    // The audio URL (without ?v=) is a file of the output directory, as Hosting will serve it.
    const audioPath = lesson.audioUrl!.replace(/^\/content\//, '').replace(/\?.*$/, '');
    expect(readFileSync(join(out, audioPath))).toEqual(readFileSync(join(contentDir, audioPath)));
    for (const rel of [
      `${LISTENING}/lesson.yaml`,
      `${LISTENING}/timings.json`,
      CACHE_FILE,
      `${CLIPS_DIR}/x.mp3`,
      'tts.config.yaml',
      'dictionary/run.yaml',
      'daily-plan.yaml',
    ]) {
      expect(existsSync(join(out, rel)), rel).toBe(false);
      expect(isPublicMediaPath(rel), rel).toBe(false);
    }
  });
});

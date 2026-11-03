/**
 * Helpers shared by `content:tts`, `content:tts-words` and `content:build` for audio files that
 * live next to the content (plan 2.3 / 2.4).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * File name (without `.mp3`) of a word's pronunciation in `content/words/`.
 * Lowercase ASCII letters, digits and dashes: `I'm afraid` → `i-m-afraid`, `bus stop` → `bus-stop`.
 */
export function wordAudioSlug(lemma: string): string {
  const slug = lemma
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`cannot make a file name for lemma "${lemma}"`);
  return slug;
}

/** Relative path (from `content/`) of a word's pronunciation file. */
export function wordAudioPath(lemma: string): string {
  return `words/${wordAudioSlug(lemma)}.mp3`;
}

export interface HashableSegment {
  id: string;
  speaker?: string | null;
  text_en: string;
}

/** Hash of what a lesson's audio is made from (ids, speakers, texts). Stored in timings.json. */
export function lessonTextHash(segments: readonly HashableSegment[]): string {
  const data = JSON.stringify(segments.map((s) => [s.id, s.speaker ?? null, s.text_en]));
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/** Short content hash of a file, used as the `?v=` cache buster of static URLs. */
export function fileVersion(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10);
}

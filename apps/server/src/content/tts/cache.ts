/**
 * Per-clip cache (plan 2.4): `content/.tts-cache.json` maps
 * hash(provider + text + voice + speakingRate + tier) → a clip in `content/.tts-clips/`.
 * Re-running `content:tts` never calls the API again for a clip that is already cached.
 *
 * Both the index and the clips are git-ignored: only the final audio.mp3 / words/*.mp3 are
 * committed (committing clips would roughly double the audio stored in git). On a fresh clone the
 * cache is empty, but lessons whose audio is up to date are skipped anyway (timings.json textHash).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VoiceTier } from './voices.js';

export const CACHE_FILE = '.tts-cache.json';
export const CLIPS_DIR = '.tts-clips';

export interface CacheEntry {
  file: string;
  provider: string;
  voice: string;
  chars: number;
  createdAt: string;
}

interface CacheIndex {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export function clipKey(parts: {
  provider: string;
  text: string;
  voice: string;
  speakingRate: number | undefined;
  tier: VoiceTier;
}): string {
  const data = JSON.stringify([
    parts.provider,
    parts.text,
    parts.voice,
    parts.speakingRate ?? null,
    parts.tier,
  ]);
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

export class TtsCache {
  readonly indexPath: string;
  readonly clipsDir: string;
  private index: CacheIndex;

  constructor(contentDir: string) {
    this.indexPath = join(contentDir, CACHE_FILE);
    this.clipsDir = join(contentDir, CLIPS_DIR);
    this.index = { version: 1, entries: {} };
    if (existsSync(this.indexPath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.indexPath, 'utf8')) as CacheIndex;
        if (parsed.version === 1 && parsed.entries) this.index = parsed;
      } catch {
        // Corrupt index: start over (clips are re-created on demand).
      }
    }
  }

  clipPath(key: string): string {
    return join(this.clipsDir, `${key}.mp3`);
  }

  has(key: string): boolean {
    return key in this.index.entries && existsSync(this.clipPath(key));
  }

  put(key: string, audio: Buffer, meta: Omit<CacheEntry, 'file' | 'createdAt'>): void {
    mkdirSync(this.clipsDir, { recursive: true });
    const tmp = `${this.clipPath(key)}.tmp`;
    writeFileSync(tmp, audio);
    renameSync(tmp, this.clipPath(key));
    this.index.entries[key] = { file: `${key}.mp3`, createdAt: new Date().toISOString(), ...meta };
    this.save();
  }

  private save(): void {
    const sorted = Object.fromEntries(
      Object.entries(this.index.entries).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(this.indexPath, JSON.stringify({ version: 1, entries: sorted }, null, 2) + '\n');
  }
}

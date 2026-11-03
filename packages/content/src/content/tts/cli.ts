/** Shared plumbing for the `content:tts*` scripts (argument parsing, provider, content dir). */
import { cpSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT_DIR } from '../../config.js';
import { CACHE_FILE, CLIPS_DIR } from './cache.js';
import { TTS_CONFIG_FILE } from './config.js';
import { createFakeProvider } from './fake.js';
import { FfmpegMissingError } from './ffmpeg.js';
import { createGoogleProvider } from './google.js';
import type { TtsProvider } from './provider.js';
import { DEFAULT_MAX_CHARS } from './run.js';

export const REPO_CONTENT_DIR = join(ROOT_DIR, 'content');

export function createProvider(name: string, env: NodeJS.ProcessEnv = process.env): TtsProvider {
  if (name === 'fake') return createFakeProvider();
  if (name !== 'google') throw new Error(`unknown --provider "${name}" (use google or fake)`);
  const apiKey = env.GOOGLE_TTS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GOOGLE_TTS_API_KEY is not set. Add it to .env (see .env.example). ' +
        'Use --dry-run to only count characters.',
    );
  }
  return createGoogleProvider({ apiKey });
}

export function maxChars(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TTS_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_MAX_CHARS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid TTS_MAX_CHARS: ${raw}`);
  return n;
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : resolve(p));
  return real(a) === real(b);
}

/**
 * Content directory to read and write. The fake provider must never write into the repo's
 * `content/`: it requires `--out <dir>`, and an empty `<dir>` gets a copy of `content/` first.
 */
export function resolveContentDir(
  out: string | undefined,
  provider: string,
  log: (line: string) => void,
): string {
  if (!out) {
    if (provider === 'fake') {
      throw new Error(
        'the fake provider writes test audio: pass --out <tmp dir> (a copy of content/ is made there)',
      );
    }
    return REPO_CONTENT_DIR;
  }
  const dir = resolve(out);
  if (provider === 'fake' && samePath(dir, REPO_CONTENT_DIR)) {
    throw new Error('refusing to write fake audio into the repository content/ directory');
  }
  if (!existsSync(join(dir, TTS_CONFIG_FILE))) {
    mkdirSync(dir, { recursive: true });
    cpSync(REPO_CONTENT_DIR, dir, {
      recursive: true,
      filter: (src) => !src.endsWith(CACHE_FILE) && !src.includes(CLIPS_DIR),
    });
    log(`copied content/ to ${dir}`);
  }
  return dir;
}

/** Print an error message (no stack trace) and set a failing exit code. */
export function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err instanceof FfmpegMissingError ? message : `Error: ${message}`);
  process.exitCode = 1;
}

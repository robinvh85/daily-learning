/**
 * Fingerprint of `content/` and the startup auto-sync (plan Phase 7).
 *
 * `npm start` must work on a fresh clone without a manual `content:sync`, but re-validating and
 * rewriting 600+ dictionary entries on every start is wasteful. So the server hashes the files that
 * `content:sync` reads and compares that with the hash stored in `app_meta` at the last successful
 * sync: it syncs when the database has no lessons or when the hash differs, and skips otherwise.
 *
 * Hashed: every `*.yaml` and `timings.json` (full contents), plus name + size + mtime of media
 * (`*.mp3`, covers). Hashing media metadata keeps this fast even with hundreds of MB of audio; a
 * changed mtime (e.g. after `git checkout`) only causes one harmless extra sync. Dotfiles and
 * dot-directories (`.tts-cache.json`, `.tts-clips/`) are ignored.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { appMeta, lessons } from '../db/schema.js';
import { formatIssues } from './load.js';
import { syncContent, type SyncCounts } from './sync.js';

export const CONTENT_HASH_KEY = 'content_hash';

const TEXT_FILE = /(?:\.ya?ml|timings\.json)$/i;
const MEDIA_FILE = /\.(?:mp3|webp|png|jpe?g)$/i;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() && (TEXT_FILE.test(entry.name) || MEDIA_FILE.test(entry.name)))
      out.push(path);
  }
}

/** SHA-256 over the content files that `content:sync` depends on (order-independent of the OS). */
export function contentFingerprint(contentDir: string): string {
  const files: string[] = [];
  if (existsSync(contentDir)) walk(contentDir, files);
  const rels = files
    .map((path) => ({ path, rel: relative(contentDir, path).split(sep).join('/') }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = createHash('sha256');
  for (const { path, rel } of rels) {
    hash.update(rel).update('\0');
    if (TEXT_FILE.test(rel)) {
      hash.update(readFileSync(path));
    } else {
      const st = statSync(path);
      hash.update(`${st.size}:${Math.floor(st.mtimeMs)}`);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readMeta(db: AppDatabase, key: string): string | null {
  return db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value ?? null;
}

export function writeMeta(db: AppDatabase, key: string, value: string): void {
  db.insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } })
    .run();
}

export type AutoSyncResult =
  | { status: 'skipped'; hash: string }
  | { status: 'synced'; hash: string; reason: 'empty' | 'changed'; counts: SyncCounts }
  | { status: 'failed'; hash: string; reason: 'empty' | 'changed'; message: string };

/**
 * Sync `content/` into the database when it has no lessons yet or when the content changed since
 * the last successful sync. Never throws on invalid content: the caller logs the failure and the
 * app keeps serving what is already in the database.
 */
export function autoSyncContent(db: AppDatabase, contentDir: string): AutoSyncResult {
  const hash = contentFingerprint(contentDir);
  const lessonCount = db.select({ n: count() }).from(lessons).get()?.n ?? 0;
  const stored = readMeta(db, CONTENT_HASH_KEY);
  if (lessonCount > 0 && stored === hash) return { status: 'skipped', hash };

  const reason = lessonCount === 0 ? 'empty' : 'changed';
  const result = syncContent({ contentDir, db });
  if (!result.ok || !result.counts) {
    return { status: 'failed', hash, reason, message: formatIssues(result.issues) };
  }
  writeMeta(db, CONTENT_HASH_KEY, hash);
  return { status: 'synced', hash, reason, counts: result.counts };
}

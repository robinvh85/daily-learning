import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ROOT_DIR } from '../src/config.js';
import {
  autoSyncContent,
  CONTENT_HASH_KEY,
  contentFingerprint,
  readMeta,
} from '../src/content/fingerprint.js';
import { openAndMigrate } from '../src/db/client.js';
import { isSpaFallbackPath } from '../src/modules/static/web.js';

describe('production web static + SPA fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-web-'));
  const webDir = join(dir, 'dist');
  const db = openAndMigrate(join(dir, 'app.db'));
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    mkdirSync(join(webDir, 'assets'), { recursive: true });
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>SPA</title>');
    writeFileSync(join(webDir, 'assets', 'index-abc123.js'), 'console.log(1)');
    app = await buildApp({ db, webDir, contentDir: join(ROOT_DIR, 'content') });
  });
  afterAll(async () => {
    await app.close();
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html with no-cache at / and for deep links', async () => {
    for (const url of ['/', '/read/a-new-coffee-shop', '/vocab?tab=book']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('<title>SPA</title>');
    }
  });

  it('caches hashed assets for a year', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('keeps JSON 404s for /api, /content, missing assets and non-GET', async () => {
    for (const url of ['/api/nope', '/content/lessons/x.yaml', '/assets/missing.js']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toMatchObject({ error: 'not_found' });
    }
    const post = await app.inject({ method: 'POST', url: '/read/x' });
    expect(post.statusCode).toBe(404);
  });

  it('still serves the API', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('classifies fallback paths', () => {
    expect(isSpaFallbackPath('/listen/at-the-train-station')).toBe(true);
    expect(isSpaFallbackPath('/api')).toBe(false);
    expect(isSpaFallbackPath('/apical')).toBe(true);
    expect(isSpaFallbackPath('/content/words/a.mp3')).toBe(false);
  });
});

describe('autoSyncContent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-autosync-'));
  const contentDir = join(dir, 'content');
  cpSync(join(ROOT_DIR, 'content'), contentDir, {
    recursive: true,
    filter: (src) => !src.includes('.tts-'),
  });
  const db = openAndMigrate(join(dir, 'app.db'));
  afterAll(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('syncs an empty DB, skips when unchanged, re-syncs after a change', () => {
    const first = autoSyncContent(db, contentDir);
    expect(first.status).toBe('synced');
    expect(first.status === 'synced' && first.reason).toBe('empty');
    expect(readMeta(db, CONTENT_HASH_KEY)).toBe(first.hash);

    expect(autoSyncContent(db, contentDir).status).toBe('skipped');

    const plan = join(contentDir, 'daily-plan.yaml');
    writeFileSync(plan, `# edited\n${readFileSync(plan, 'utf8')}`);
    const third = autoSyncContent(db, contentDir);
    expect(third.status).toBe('synced');
    expect(third.status === 'synced' && third.reason).toBe('changed');
    expect(third.hash).not.toBe(first.hash);
  });

  it('ignores dotfiles (TTS cache) in the fingerprint', () => {
    const before = contentFingerprint(contentDir);
    writeFileSync(join(contentDir, '.tts-cache.json'), '{}');
    expect(contentFingerprint(contentDir)).toBe(before);
  });

  it('reports invalid content without throwing or storing the hash', () => {
    const stored = readMeta(db, CONTENT_HASH_KEY);
    writeFileSync(join(contentDir, 'dictionary', 'zzz-broken.yaml'), 'lemma: [unclosed');
    const r = autoSyncContent(db, contentDir);
    expect(r.status).toBe('failed');
    expect(readMeta(db, CONTENT_HASH_KEY)).toBe(stored);
  });
});

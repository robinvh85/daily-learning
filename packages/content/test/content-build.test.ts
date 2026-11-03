import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContentCatalog } from '@daily-learning/shared/content-data';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../src/config.js';
import {
  buildContentData,
  hashId,
  lessonId,
  questionId,
  senseId,
  wordId,
  writeContentOutput,
} from '../src/content/build.js';
import { hasErrors, loadContent } from '../src/content/load.js';

const REPO_CONTENT = join(ROOT_DIR, 'content');
const tmp = mkdtempSync(join(tmpdir(), 'dl-build-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const bundle = loadContent(REPO_CONTENT);
const built = buildContentData(bundle);

describe('buildContentData', () => {
  it('builds the repository content without errors', () => {
    expect(hasErrors(bundle.issues)).toBe(false);
    expect(built.catalog.lessons).toHaveLength(bundle.lessons.length);
    expect(built.catalog.words).toHaveLength(bundle.entries.length);
    expect(built.lessons).toHaveLength(bundle.lessons.length);
  });

  it('derives ids from natural keys only (same content → same ids)', () => {
    const again = buildContentData(loadContent(REPO_CONTENT));
    expect(again).toEqual(built);
    const run = built.catalog.words.find((w) => w.lemma === 'run')!;
    expect(run.id).toBe(wordId('run'));
    expect(run.senses.map((s) => s.id)).toEqual(run.senses.map((s) => senseId('run', s.key)));
    const coffee = built.catalog.lessons.find((l) => l.slug === 'a-new-coffee-shop')!;
    expect(coffee.id).toBe(lessonId('a-new-coffee-shop'));
    const data = built.lessons.find((l) => l.slug === 'a-new-coffee-shop')!;
    expect(data.questions[0]!.id).toBe(questionId('a-new-coffee-shop', 0));
    expect(hashId('x')).toBeGreaterThan(0);
    expect(Number.isSafeInteger(hashId('x'))).toBe(true);
  });

  it('references only known words and keeps answers in the lesson files', () => {
    const ids = new Set(built.catalog.words.map((w) => w.id));
    for (const l of built.lessons) {
      for (const id of l.wordIds) expect(ids.has(id)).toBe(true);
      for (const s of l.segments) for (const t of s.tokens) expect(l.wordIds).toContain(t.wordId);
      for (const q of l.questions) expect(q.correctIdx).toBeLessThan(q.options.length);
    }
    const plan = built.catalog.plan;
    expect(plan[0]).toMatchObject({ day: 1, reading: 'a-new-coffee-shop' });
  });

  it('changes the version when the content changes', () => {
    const dir = join(tmp, 'content');
    cpSync(REPO_CONTENT, dir, { recursive: true, filter: (src) => !src.endsWith('.mp3') });
    const file = join(dir, 'lessons/a2/a-new-coffee-shop/lesson.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('Where is the coffee shop?', 'Where?'));
    const changed = buildContentData(loadContent(dir));
    expect(changed.catalog.version).not.toBe(built.catalog.version);
  });
});

describe('writeContentOutput', () => {
  it('writes the JSON files, copies media once and removes stale files', () => {
    const out = join(tmp, 'out');
    const first = writeContentOutput(built, REPO_CONTENT, out);
    expect(first.dataFiles).toBe(2 + built.lessons.length);
    const catalog = JSON.parse(
      readFileSync(join(out, 'data/catalog.json'), 'utf8'),
    ) as ContentCatalog;
    expect(catalog.version).toBe(built.catalog.version);

    writeFileSync(join(out, 'stale.mp3'), 'x');
    const second = writeContentOutput(built, REPO_CONTENT, out);
    expect(second.mediaCopied).toBe(0);
    expect(second.mediaKept).toBe(first.mediaCopied);
    expect(second.removed).toBe(1);
    expect(existsSync(join(out, 'stale.mp3'))).toBe(false);
  });
});

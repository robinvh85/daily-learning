import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveDbPath, ROOT_DIR } from '../src/config.js';
import { openAndMigrate } from '../src/db/client.js';

const tmp = mkdtempSync(join(tmpdir(), 'dl-db-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('database', () => {
  it('creates the file, applies migrations and sets the pragmas from plan 2.2', () => {
    const db = openAndMigrate(join(tmp, 'nested/dir/app.db'));
    const c = db.$client;
    expect(c.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(c.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(c.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
    const tables = (
      c
        .prepare(
          `select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' and name not like 'sqlite_%' order by name`,
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).toEqual([
      'answers',
      'daily_activity',
      'daily_plans_template',
      'dictation_items',
      'lesson_progress',
      'lesson_tokens',
      'lesson_words',
      'lessons',
      'questions',
      'review_logs',
      'segments',
      'sessions',
      'user_words',
      'users',
      'word_forms',
      'word_senses',
      'words',
    ]);
    c.close();
  });

  it('is safe to migrate twice', () => {
    const path = join(tmp, 'twice.db');
    openAndMigrate(path).$client.close();
    const db = openAndMigrate(path);
    expect(db.$client.prepare('select count(*) n from __drizzle_migrations').get()).toEqual({
      n: 4,
    });
    db.$client.close();
  });

  it('enforces constraints on user tables', () => {
    const db = openAndMigrate(':memory:');
    const c = db.$client;
    c.exec('insert into users (id) values (1)');
    // An answer must point at exactly one question or dictation item.
    expect(() =>
      c.exec(`insert into answers (user_id, value, correct) values (1, 'x', 0)`),
    ).toThrow(/CHECK/);
    c.exec(
      `insert into words (id, lemma, ipa_us, cefr, oxford3000, status) values (1, 'run', '/rʌn/', 'A1', 1, 'draft')`,
    );
    expect(() =>
      c.exec('insert into review_logs (user_id, word_id, rating) values (1, 1, 5)'),
    ).toThrow(/CHECK/);
    c.exec('insert into review_logs (user_id, word_id, rating) values (1, 1, 4)');
    // Foreign keys are on.
    expect(() => c.exec('insert into user_words (user_id, word_id) values (1, 999)')).toThrow(
      /FOREIGN KEY/,
    );
    c.close();
  });
});

describe('resolveDbPath', () => {
  it('defaults to ./data/app.db under the repo root', () => {
    expect(resolveDbPath({})).toBe(join(ROOT_DIR, 'data/app.db'));
  });

  it('resolves relative paths against the repo root and keeps absolute ones', () => {
    expect(resolveDbPath({ DB_PATH: './tmp/x.db' })).toBe(join(ROOT_DIR, 'tmp/x.db'));
    expect(resolveDbPath({ DB_PATH: '/var/lib/app.db' })).toBe('/var/lib/app.db');
    expect(resolveDbPath({ DB_PATH: ':memory:' })).toBe(':memory:');
  });
});

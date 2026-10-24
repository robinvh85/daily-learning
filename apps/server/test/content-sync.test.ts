import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../src/config.js';
import { loadContent } from '../src/content/load.js';
import { syncContent } from '../src/content/sync.js';
import { openAndMigrate, type AppDatabase } from '../src/db/client.js';

const REAL_CONTENT = join(ROOT_DIR, 'content');
const CONTENT_TABLES = [
  'words',
  'word_forms',
  'word_senses',
  'lessons',
  'segments',
  'lesson_tokens',
  'lesson_words',
  'questions',
  'dictation_items',
  'daily_plans_template',
];

let tmp: string;
let db: AppDatabase;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dl-sync-'));
  cpSync(REAL_CONTENT, join(tmp, 'content'), { recursive: true });
  db = openAndMigrate(join(tmp, 'app.db'));
});

afterEach(() => {
  db.$client.close();
  rmSync(tmp, { recursive: true, force: true });
});

function dump(): Record<string, unknown[]> {
  return Object.fromEntries(
    CONTENT_TABLES.map((t) => [t, db.$client.prepare(`select * from ${t} order by 1, 2`).all()]),
  );
}

describe('repository content', () => {
  it('validates without errors or warnings', () => {
    const bundle = loadContent(REAL_CONTENT);
    expect(bundle.issues).toEqual([]);
    expect(bundle.lessons.map((l) => l.slug).sort()).toEqual([
      'a-new-coffee-shop',
      'at-the-train-station',
    ]);
  });
});

describe('syncContent', () => {
  it('writes lessons, tokens and the daily plan', () => {
    const r = syncContent({ contentDir: join(tmp, 'content'), db });
    expect(r.ok).toBe(true);
    const q = (sql: string) => db.$client.prepare(sql).all();

    // Every token points at a word and a sense.
    expect(q('select count(*) n from lesson_tokens where sense_id is null')).toEqual([{ n: 0 }]);
    // Context senses from lesson.yaml.
    expect(
      q(`select t.surface, ws.key from lesson_tokens t join word_senses ws on ws.id = t.sense_id
         join words w on w.id = t.word_id where w.lemma in ('run', 'for') order by t.lesson_id, t.segment_id, t.idx`),
    ).toEqual([
      { surface: 'for', key: 'duration' },
      { surface: 'run', key: 'manage' },
      { surface: 'For', key: 'opinion' },
      { surface: 'for', key: 'duration' },
      { surface: 'running', key: 'operate' },
    ]);
    // Focus words of the reading lesson, in order, with their sense.
    expect(
      q(`select w.lemma, ws.key from lesson_words lw join lessons l on l.id = lw.lesson_id
         join words w on w.id = lw.word_id join word_senses ws on ws.id = lw.sense_id
         where l.slug = 'a-new-coffee-shop' order by lw.idx`).map(
        (r) => `${(r as { lemma: string }).lemma}:${(r as { key: string }).key}`,
      ),
    ).toEqual([
      'open:business',
      'owner:owner',
      'run:manage',
      'comfortable:comfortable',
      'borrow:borrow',
      'reasonable:reasonable',
      'regular:regular',
      'atmosphere:atmosphere',
    ]);
    expect(
      q(`select r.slug reading, li.slug listening from daily_plans_template d
         join lessons r on r.id = d.reading_lesson_id join lessons li on li.id = d.listening_lesson_id where d.day = 1`),
    ).toEqual([{ reading: 'a-new-coffee-shop', listening: 'at-the-train-station' }]);
    // Token offsets match the segment text.
    const rows = q(
      'select s.text_en, t.surface, t.start_char, t.end_char from lesson_tokens t join segments s on s.id = t.segment_id',
    ) as { text_en: string; surface: string; start_char: number; end_char: number }[];
    for (const row of rows)
      expect(row.text_en.slice(row.start_char, row.end_char)).toBe(row.surface);
  });

  it('is idempotent: a second sync leaves every content row (and id) unchanged', () => {
    expect(syncContent({ contentDir: join(tmp, 'content'), db }).ok).toBe(true);
    const first = dump();
    const second = syncContent({ contentDir: join(tmp, 'content'), db });
    expect(second.ok).toBe(true);
    expect(dump()).toEqual(first);
  });

  it('keeps ids stable and removes deleted rows when content changes', () => {
    syncContent({ contentDir: join(tmp, 'content'), db });
    const runId = db.$client.prepare(`select id from words where lemma = 'run'`).get();
    rmSync(join(tmp, 'content/lessons/a2/at-the-train-station'), { recursive: true });
    writeFileSync(
      join(tmp, 'content/daily-plan.yaml'),
      'days:\n  - day: 1\n    reading: a-new-coffee-shop\n',
    );
    // Dictionary entries only used by the removed lesson are still valid files, so they stay.
    expect(syncContent({ contentDir: join(tmp, 'content'), db }).ok).toBe(true);
    expect(db.$client.prepare(`select id from words where lemma = 'run'`).get()).toEqual(runId);
    expect(db.$client.prepare('select slug from lessons').all()).toEqual([
      { slug: 'a-new-coffee-shop' },
    ]);
    expect(db.$client.prepare('select count(*) n from dictation_items').get()).toEqual({ n: 0 });
  });

  it('refuses to delete a dictionary entry that a user saved', () => {
    syncContent({ contentDir: join(tmp, 'content'), db });
    db.$client.exec(`insert into users (id) values (1);
      insert into user_words (user_id, word_id) select 1, id from words where lemma = 'oh'`);
    rmSync(join(tmp, 'content/lessons/a2/at-the-train-station'), { recursive: true });
    writeFileSync(
      join(tmp, 'content/daily-plan.yaml'),
      'days:\n  - day: 1\n    reading: a-new-coffee-shop\n',
    );
    rmSync(join(tmp, 'content/dictionary/oh.yaml'));
    const r = syncContent({ contentDir: join(tmp, 'content'), db });
    expect(r.ok).toBe(false);
    expect(r.issues.at(-1)?.message).toMatch(
      /cannot remove dictionary entries that a user has saved: oh/,
    );
    // The transaction was rolled back.
    expect(db.$client.prepare('select count(*) n from lessons').get()).toEqual({ n: 2 });
  });

  it('dry-run reports a word missing from the dictionary and writes nothing', () => {
    rmSync(join(tmp, 'content/dictionary/bakery.yaml'));
    const r = syncContent({ contentDir: join(tmp, 'content'), dryRun: true });
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({
      level: 'error',
      file: 'lessons/a2/a-new-coffee-shop/lesson.yaml',
      message:
        '"bakery" (segment p1s2) is not in the dictionary; add content/dictionary/<lemma>.yaml or list it in ignore',
    });
    // A real sync with the same content refuses to write.
    expect(syncContent({ contentDir: join(tmp, 'content'), db }).ok).toBe(false);
    expect(db.$client.prepare('select count(*) n from words').get()).toEqual({ n: 0 });
  });

  it('dry-run reports invalid files', () => {
    writeFileSync(join(tmp, 'content/dictionary/broken.yaml'), 'lemma: broken\nipa_us: nope\n');
    writeFileSync(join(tmp, 'content/dictionary/Run.yaml'), 'lemma: run\n');
    const r = syncContent({ contentDir: join(tmp, 'content'), dryRun: true });
    expect(r.ok).toBe(false);
    const files = r.issues.filter((i) => i.level === 'error').map((i) => i.file);
    expect(files).toContain('dictionary/broken.yaml');
    expect(files).toContain('dictionary/Run.yaml');
  });

  it('dry-run reports a daily plan that points at an unknown lesson', () => {
    writeFileSync(
      join(tmp, 'content/daily-plan.yaml'),
      'days:\n  - day: 1\n    reading: at-the-train-station\n    listening: nope\n',
    );
    const r = syncContent({ contentDir: join(tmp, 'content'), dryRun: true });
    expect(r.issues.map((i) => i.message)).toEqual([
      'day 1: "at-the-train-station" is not a reading lesson',
      'day 1: unknown lesson "nope"',
    ]);
  });
});

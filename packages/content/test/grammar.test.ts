import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dailyPlanSchema,
  findGrammarMatch,
  grammarPointSchema,
  lessonSchema,
  orderWords,
} from '@daily-learning/shared/content';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../src/config.js';
import {
  buildContentData,
  dataFiles,
  grammarExerciseId,
  grammarPointId,
} from '../src/content/build.js';
import { collectGrammarMarks } from '../src/content/grammar.js';
import { hasErrors, loadContent } from '../src/content/load.js';

const REPO_CONTENT = join(ROOT_DIR, 'content');
const tmp = mkdtempSync(join(tmpdir(), 'dl-grammar-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function messages(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`);
}

const validPoint = {
  slug: 'past-simple-regular',
  title: 'Quá khứ đơn',
  title_en: 'Past simple',
  level: 'A2',
  group: 'tenses',
  summary: 'Việc đã xong.',
  discover: { question: 'Có gì chung?', answer: 'Thêm -ed.', pinned: ['a-lesson#p1s1'] },
  form: [{ label: 'Khẳng định', pattern: 'S + V-ed', example: 'She worked.' }],
  usage: ['Việc đã xong.'],
  exercises: [
    {
      type: 'choice',
      prompt: 'We ___ home.',
      options: ['walk', 'walked'],
      correct: 1,
      explain: 'x',
    },
    {
      type: 'gap',
      prompt: 'She ___ (not / like) it.',
      answer: "didn't like",
      accept: ['did not like'],
      explain: 'x',
    },
    { type: 'order', words: ['you', 'did', 'call'], answer: 'Did you call?', explain: 'x' },
    {
      type: 'find_error',
      sentence: 'I watch it yesterday.',
      wrong: 'watch',
      right: 'watched',
      explain: 'x',
    },
  ],
  detect: '\\b\\w+ed\\b',
  status: 'draft',
};

describe('findGrammarMatch', () => {
  it('finds whole words, ignoring case and curly apostrophes', () => {
    expect(findGrammarMatch('I usually go there.', 'usually go')).toEqual([[2, 12]]);
    expect(findGrammarMatch('There’s one at 10:05.', "there's")).toEqual([[0, 7]]);
    expect(findGrammarMatch('She opened it.', 'open')).toBeNull();
    expect(findGrammarMatch('He was late, but it was fine.', 'was … was')).toEqual([
      [3, 6],
      [20, 23],
    ]);
  });

  it('skips a part found inside another word and keeps searching', () => {
    expect(findGrammarMatch('The washing was done.', 'was')).toEqual([[12, 15]]);
  });

  it('needs the parts in order', () => {
    expect(findGrammarMatch('I got up and was tired.', 'was … got up')).toBeNull();
  });
});

describe('grammarPointSchema', () => {
  it('accepts the format of grammar plan 4.1 and fills defaults', () => {
    const r = grammarPointSchema.parse(validPoint);
    expect(r.signals).toEqual([]);
    expect(r.common_mistakes).toEqual([]);
    expect(r.exercises).toHaveLength(4);
  });

  it('rejects broken exercises', () => {
    const bad = {
      ...validPoint,
      exercises: [
        { type: 'choice', prompt: 'No blank.', options: ['a', 'A'], correct: 2, explain: 'x' },
        { type: 'gap', prompt: '___ and ___', answer: 'go', accept: ['Go'], explain: 'x' },
        { type: 'order', words: ['you', 'call', 'me'], answer: 'Did you call?', explain: 'x' },
        {
          type: 'find_error',
          sentence: 'I watched it.',
          wrong: 'watch',
          right: 'Watch',
          explain: 'x',
        },
        { type: 'unknown', explain: 'x' },
      ],
    };
    const msgs = messages(grammarPointSchema.safeParse(bad));
    expect(msgs.some((m) => m.startsWith('exercises.4'))).toBe(true);
    const fixed = { ...bad, exercises: bad.exercises.slice(0, 4) };
    expect(messages(grammarPointSchema.safeParse(fixed))).toEqual([
      'exercises.0.prompt: the prompt needs exactly one ___',
      'exercises.0.correct: correct must be the index of one of the options (0-based)',
      'exercises.0.options: duplicate options',
      'exercises.1.prompt: the prompt needs exactly one ___',
      'exercises.1.accept: accept repeats the answer or another accepted answer',
      'exercises.2.words: words must be exactly the words of the answer',
      'exercises.3.wrong: "watch" is not in the sentence (whole words)',
      'exercises.3.right: right must differ from wrong',
    ]);
  });

  it('rejects a bad pin, a duplicate pin and an invalid detect pattern', () => {
    const msgs = messages(
      grammarPointSchema.safeParse({
        ...validPoint,
        discover: { ...validPoint.discover, pinned: ['a-lesson#p1s1', 'a-lesson#p1s1', 'nope'] },
        detect: '(',
      }),
    );
    expect(msgs).toContain('discover.pinned.2: use "lesson-slug#segment-id"');
    expect(msgs.some((m) => m.startsWith('detect: invalid regular expression'))).toBe(true);
  });

  it('compares order words without case or end punctuation', () => {
    expect(orderWords('Did you call the landlord?')).toEqual([
      'did',
      'you',
      'call',
      'the',
      'landlord',
    ]);
  });
});

describe('lesson grammar marks', () => {
  const lesson = {
    kind: 'reading',
    level: 'A2',
    topic: 'daily-life',
    title: 'A Test',
    segments: [{ id: 'p1s1', paragraph: 1, text_en: 'I usually go there.', text_vi: 'x' }],
  };

  it('accepts a mark whose match is in the segment', () => {
    const r = lessonSchema.parse({
      ...lesson,
      grammar: [{ point: 'present-simple', segment: 'p1s1', match: 'usually go', note: 'n' }],
    });
    expect(r.grammar[0]!.note).toBe('n');
  });

  it('rejects unknown segments, missing matches and duplicates', () => {
    const msgs = messages(
      lessonSchema.safeParse({
        ...lesson,
        grammar: [
          { point: 'p', segment: 'p9s9', match: 'go' },
          { point: 'p', segment: 'p1s1', match: 'went' },
          { point: 'p', segment: 'p1s1', match: 'go' },
          { point: 'p', segment: 'p1s1', match: 'Go' },
        ],
      }),
    );
    expect(msgs).toEqual([
      'grammar.0.segment: unknown segment id "p9s9"',
      'grammar.1.match: "went" is not in segment "p1s1" (whole words; put … between separate parts)',
      'grammar.3: "Go" in segment "p1s1" is marked twice for p',
    ]);
  });

  it('accepts grammar on a plan day', () => {
    const r = dailyPlanSchema.parse({
      days: [{ day: 1, reading: 'a', grammar: 'present-simple' }],
    });
    expect(r.days[0]!.grammar).toBe('present-simple');
  });
});

describe('repository grammar content', () => {
  const bundle = loadContent(REPO_CONTENT);
  const built = buildContentData(bundle);

  it('loads without errors or warnings', () => {
    expect(hasErrors(bundle.issues)).toBe(false);
    expect(bundle.issues.filter((i) => /grammar/i.test(i.message + i.file))).toEqual([]);
    expect(bundle.grammar.length).toBeGreaterThanOrEqual(3);
  });

  it('merges several marks of one sentence', () => {
    const marks = collectGrammarMarks(bundle.lessons).filter(
      (m) => m.lesson.slug === 'a-weekend-in-da-lat' && m.segmentKey === 'p4s3',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.ranges).toHaveLength(2);
  });

  it('builds the catalog, plan days and one file per point', () => {
    const g = built.catalog.grammar.find((p) => p.slug === 'past-simple-regular')!;
    expect(g.id).toBe(grammarPointId('past-simple-regular'));
    expect(g.days).toEqual([2]);
    expect(g.lessons).toContain('my-first-week-at-a-new-job');
    expect(built.catalog.plan.find((d) => d.day === 2)!.grammar).toBe('past-simple-regular');
    expect(built.catalog.plan.find((d) => d.day === 3)!.grammar).toBe('countable-uncountable');
    const files = dataFiles(built);
    expect(files.has('grammar/past-simple-regular.json')).toBe(true);
  });

  it('orders examples: the day first, then pinned, then the rest', () => {
    const data = built.grammar.find((p) => p.slug === 'past-simple-regular')!;
    const sources = data.discover.examples.map((e) => e.source);
    expect(sources[0]).toBe('day');
    expect(sources).toEqual(
      [...sources].sort(
        (a, b) => ['day', 'pinned', 'other'].indexOf(a) - ['day', 'pinned', 'other'].indexOf(b),
      ),
    );
    expect(
      data.discover.examples
        .filter((e) => e.source === 'pinned')
        .map((e) => `${e.lessonSlug}#${e.segmentKey}`),
    ).toEqual(['a-new-coffee-shop#p1s4', 'a-weekend-in-da-lat#p3s2']);
    for (const e of data.discover.examples)
      for (const [s, end] of e.ranges) expect(e.textEn.slice(s, end).length).toBeGreaterThan(0);
    expect(data.exercises[0]!.id).toBe(grammarExerciseId('past-simple-regular', 0));
  });

  it('puts the marks into the lesson files', () => {
    const lesson = built.lessons.find((l) => l.slug === 'a-new-coffee-shop')!;
    const seg = lesson.segments.find((s) => s.key === 'p3s1')!;
    const mark = lesson.grammar.find((m) => m.segmentId === seg.id)!;
    expect(mark.point).toBe('present-simple-frequency');
    expect(seg.textEn.slice(...mark.ranges[0]!)).toBe('usually go');
  });
});

describe('cross-file grammar checks', () => {
  function variant(edit: (dir: string) => void) {
    const dir = mkdtempSync(join(tmp, 'c-'));
    cpSync(REPO_CONTENT, dir, { recursive: true, filter: (src) => !src.endsWith('.mp3') });
    edit(dir);
    return loadContent(dir).issues.filter(
      (i) => i.file === 'daily-plan.yaml' || /grammar/i.test(i.message + i.file),
    );
  }
  const replaceIn = (dir: string, rel: string, from: string, to: string) => {
    const file = join(dir, rel);
    writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));
  };

  it('reports unknown points in lessons and in the plan', () => {
    const issues = variant((dir) => {
      replaceIn(dir, 'daily-plan.yaml', 'grammar: past-simple-irregular', 'grammar: nope');
      replaceIn(
        dir,
        'lessons/a2/at-the-train-station/lesson.yaml',
        'point: present-simple-frequency',
        'point: missing-point',
      );
    });
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'day 6: unknown grammar point "nope"',
        expect.stringContaining('grammar: unknown grammar point "missing-point"'),
      ]),
    );
  });

  it('reports a pin without a mark and a day with too few sentences', () => {
    const issues = variant((dir) => {
      replaceIn(
        dir,
        'grammar/past-simple-regular.yaml',
        'a-weekend-in-da-lat#p3s2',
        'a-weekend-in-da-lat#p4s4',
      );
      replaceIn(
        dir,
        'daily-plan.yaml',
        'grammar: past-simple-irregular',
        'grammar: present-simple-frequency',
      );
    });
    const msgs = issues.map((i) => `${i.level} ${i.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'error discover.pinned: "a-weekend-in-da-lat#p4s4" has no grammar mark',
        ),
        'warning day 6: grammar point "present-simple-frequency" is already taught on day 1',
        "warning day 6: 0 sentence(s) marked with present-simple-frequency in the day's lessons (need 2)",
      ]),
    );
  });
});

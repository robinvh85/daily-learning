import { describe, expect, it } from 'vitest';
import {
  buildLookup,
  normalizeWord,
  splitWords,
  tokenizeLesson,
  type LookupEntry,
} from '../src/content/tokenizer.js';

const entry = (lemma: string, forms: string[] = [], senses: string[] = ['main']): LookupEntry => ({
  lemma,
  forms,
  senses: senses.map((key) => ({ key })),
});

const ENTRIES: LookupEntry[] = [
  entry('a', ['an']),
  entry('the'),
  entry('I'),
  entry('it'),
  entry('train', ['trains']),
  entry('bus'),
  entry('stop', ['stops', 'stopped']),
  entry('bus stop', ['bus stops']),
  entry('coffee'),
  entry('coffee shop'),
  entry('small coffee shop'),
  entry('run', ['runs', 'ran', 'running'], ['manage', 'move', 'operate']),
  entry('be', ['is', 'are'], ['linking', 'location']),
  entry('there is', ['there are', "there's", 'is there']),
  entry("it's"),
  entry("I'll"),
  entry("I'm"),
  entry("I'm afraid"),
  entry('late'),
  entry('wait'),
  entry('shop'),
  entry('well-known'),
  entry('at', [], ['place', 'time']),
];

const { lookup, errors: lookupErrors } = buildLookup(ENTRIES);

function words(text: string, opts: Parameters<typeof tokenizeLesson>[1] = { lookup }) {
  const r = tokenizeLesson([text], opts);
  return r.tokens[0]!.map((t) => `${t.surface}=${t.lemma}`);
}

describe('normalizeWord', () => {
  it('lowercases and straightens curly apostrophes', () => {
    expect(normalizeWord('I’m')).toBe("i'm");
    expect(normalizeWord('There‘s')).toBe("there's");
  });
});

describe('splitWords', () => {
  it('returns words with UTF-16 offsets and drops punctuation', () => {
    const text = 'Oh no. Is there an earlier train?';
    const ws = splitWords(text);
    expect(ws.map((w) => w.text)).toEqual(['Oh', 'no', 'Is', 'there', 'an', 'earlier', 'train']);
    for (const w of ws) expect(text.slice(w.start, w.end)).toBe(w.text);
  });

  it('skips numbers and times', () => {
    const ws = splitWords('Platform 4. The 10:15 train, 2nd class, 3.5 hours');
    expect(ws.map((w) => w.text)).toEqual(['Platform', 'The', 'train', 'class', 'hours']);
  });

  it('keeps contractions and hyphenated words together, not surrounding quotes', () => {
    const ws = splitWords("“I’m late,” she said. 'It's well-known.'");
    expect(ws.map((w) => w.text)).toEqual(['I’m', 'late', 'she', 'said', "It's", 'well-known']);
  });
});

describe('buildLookup', () => {
  it('builds without errors for a clean dictionary', () => {
    expect(lookupErrors).toEqual([]);
    expect(lookup.maxWords).toBe(3);
  });

  it('reports a form that belongs to two entries', () => {
    const { errors } = buildLookup([entry('leave', ['left']), entry('left')]);
    expect(errors).toEqual(['form "left" of "left" is already a form of "leave"']);
  });

  it('reports duplicate lemmas ignoring case', () => {
    const { errors } = buildLookup([entry('ok'), entry('OK')]);
    expect(errors[0]).toMatch(/duplicate dictionary entry "OK"/);
  });
});

describe('tokenizeLesson', () => {
  it('maps forms to lemmas case-insensitively', () => {
    expect(words('Trains STOP. It stopped.')).toEqual([
      'Trains=train',
      'STOP=stop',
      'It=it',
      'stopped=stop',
    ]);
  });

  it('matches multi-word phrases longest first', () => {
    expect(words('A small coffee shop near the bus stop')).toEqual([
      'A=a',
      'small coffee shop=small coffee shop',
      // "near" is missing on purpose
      'the=the',
      'bus stop=bus stop',
    ]);
    expect(words('the coffee shop')).toEqual(['the=the', 'coffee shop=coffee shop']);
  });

  it('does not match a phrase across punctuation', () => {
    expect(words('I take the bus. Stop!')).toContain('bus=bus');
    expect(words('I take the bus. Stop!')).toContain('Stop=stop');
  });

  it('records character offsets of phrase tokens', () => {
    const text = 'At the  bus\nstop.';
    const r = tokenizeLesson([text], { lookup });
    const t = r.tokens[0]!.find((x) => x.lemma === 'bus stop')!;
    expect(text.slice(t.start, t.end)).toBe('bus\nstop');
    expect(t.surface).toBe('bus\nstop');
  });

  it('handles contractions with straight and curly apostrophes', () => {
    expect(words("I'm late. It’s late. I’ll wait. There’s a train.")).toEqual([
      "I'm=i'm",
      'late=late',
      "It’s=it's",
      'late=late',
      "I’ll=i'll",
      'wait=wait',
      'There’s=there is',
      'a=a',
      'train=train',
    ]);
  });

  it('prefers a phrase that starts with a contraction', () => {
    expect(words('I’m afraid it’s late. I’m late.')).toEqual([
      "I’m afraid=i'm afraid",
      "it’s=it's",
      'late=late',
      "I’m=i'm",
      'late=late',
    ]);
  });

  it('matches inverted phrase forms', () => {
    expect(words('Is there a train?')).toEqual(['Is there=there is', 'a=a', 'train=train']);
    expect(words('There are trains.')).toEqual(['There are=there is', 'trains=train']);
  });

  it('skips numbers and times without reporting them', () => {
    const r = tokenizeLesson(['The 10:15 train at 4'], { lookup });
    expect(r.tokens[0]!.map((t) => t.surface)).toEqual(['The', 'train', 'at']);
    expect(r.missing).toEqual([]);
  });

  it('applies ignore (single and multi-word) before the dictionary', () => {
    const r = tokenizeLesson(['Lan runs the coffee shop in Ho Chi Minh City. Lan’s shop.'], {
      lookup,
      ignore: ['Lan', 'Ho Chi Minh City', 'coffee', '10:15'],
    });
    expect(r.tokens[0]!.map((t) => t.surface)).toEqual(['runs', 'the', 'coffee shop', 'shop']);
    // "in" is not in the test dictionary
    expect(r.missing.map((m) => m.surface)).toEqual(['in']);
    // "coffee" is never matched alone (the longer phrase wins); "10:15" is a number: no warning
    expect(r.warnings).toEqual([
      '"run" has 3 senses but the lesson does not choose one; using "manage"',
      'ignore: "coffee" does not appear in this lesson',
    ]);
  });

  it('falls back to the base word for possessives', () => {
    expect(words('The shop’s train')).toEqual(['The=the', 'shop’s=shop', 'train=train']);
  });

  it('reports missing words with their segment and offset', () => {
    const r = tokenizeLesson(['The train', 'The platform is late'], { lookup });
    expect(r.missing).toEqual([{ segment: 1, surface: 'platform', start: 4 }]);
  });

  it('uses the first sense and warns when a multi-sense word has no choice', () => {
    const r = tokenizeLesson(['She runs a shop.'], { lookup, ignore: ['she'] });
    expect(r.tokens[0]![0]).toMatchObject({ lemma: 'run', sense: 'manage', occurrence: 1 });
    expect(r.ambiguous).toEqual(['run']);
    expect(r.warnings).toEqual([
      '"run" has 3 senses but the lesson does not choose one; using "manage"',
    ]);
  });

  it('applies senses per lemma and per occurrence (#n), counting across segments and forms', () => {
    const r = tokenizeLesson(
      ['I run a shop.', 'I ran to the bus stop.', 'The train is running late.'],
      {
        lookup,
        senses: { run: 'manage', 'ran#2': 'move', 'run#3': 'operate', be: 'linking' },
      },
    );
    const runs = r.tokens.flat().filter((t) => t.lemma === 'run');
    expect(runs.map((t) => [t.surface, t.occurrence, t.sense])).toEqual([
      ['run', 1, 'manage'],
      ['ran', 2, 'move'],
      ['running', 3, 'operate'],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('keeps the first sense for occurrences without a choice when only #n is given', () => {
    const r = tokenizeLesson(['It is at the bus stop at'], { lookup, senses: { 'at#2': 'time' } });
    const ats = r.tokens.flat().filter((t) => t.lemma === 'at');
    expect(ats.map((t) => t.sense)).toEqual(['place', 'time']);
    expect(r.ambiguous).toEqual(['be']);
  });

  it('rejects invalid sense choices', () => {
    const r = tokenizeLesson(['I run. The train is late.'], {
      lookup,
      senses: {
        run: 'swim',
        platform: 'main',
        'run#3': 'move',
        wait: 'main',
        'be#1': 'location',
      },
    });
    expect(r.errors).toEqual([
      'senses: "run" → "swim" is not a sense of "run" (available: manage, move, operate)',
      'senses: "platform" is not in the dictionary',
      'senses: "wait" does not appear in this lesson',
      'senses: "run#3" but "run" appears only 1 time(s) in this lesson',
    ]);
  });
});

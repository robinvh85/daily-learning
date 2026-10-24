import {
  dailyPlanSchema,
  dictionaryEntrySchema,
  lessonSchema,
} from '@daily-learning/shared/content';
import { describe, expect, it } from 'vitest';

const validEntry = {
  lemma: 'run',
  ipa_us: '/rʌn/',
  cefr: 'A1',
  oxford3000: true,
  forms: ['runs', 'ran', 'running'],
  senses: [
    {
      key: 'manage',
      pos: 'verb',
      vi: 'điều hành, quản lý',
      en: 'to be in charge of a business',
      collocations: ['run a business'],
      example: 'She wants to run her own business.',
    },
  ],
  status: 'draft',
};

const validReading = {
  kind: 'reading',
  level: 'A2',
  topic: 'daily-life',
  title: 'A Test',
  segments: [
    { id: 'p1s1', paragraph: 1, text_en: 'I run a shop.', text_vi: 'Tôi điều hành một cửa hàng.' },
    { id: 'p2s1', paragraph: 2, text_en: 'It is small.', text_vi: 'Nó nhỏ.' },
  ],
  focus_words: ['run'],
  senses: { run: 'manage', 'run#2': 'move', "I'm afraid": 'bad_news' },
  ignore: ['Lan'],
  questions: [{ prompt: 'What?', options: ['A', 'B'], correct: 1, evidence: 'p1s1' }],
};

const validListening = {
  kind: 'listening',
  level: 'A2',
  topic: 'travel',
  title: 'Test dialogue',
  segments: [
    { id: 'l1', speaker: 'A', text_en: 'Is it late?' },
    {
      id: 'l2',
      speaker: 'B',
      text_en: 'Platform 4. It’s running twenty minutes late.',
      start_ms: 0,
      end_ms: 4000,
    },
  ],
  dictation: [{ segment: 'l2', before: 'It’s running twenty minutes', answer: 'late', after: '.' }],
};

function messages(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('dictionaryEntrySchema', () => {
  it('accepts the format from plan 2.5 and fills defaults', () => {
    const r = dictionaryEntrySchema.parse(validEntry);
    expect(r.is_phrase).toBe(false);
    expect(r.senses[0]!.collocations).toEqual(['run a business']);
  });

  it('accepts a phrase entry', () => {
    const r = dictionaryEntrySchema.safeParse({
      ...validEntry,
      lemma: 'bus stop',
      forms: [],
      is_phrase: true,
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ['missing ipa', { ipa_us: undefined }, /ipa_us/],
    ['ipa without slashes', { ipa_us: 'rʌn' }, /between slashes/],
    ['unknown cefr', { cefr: 'A3' }, /cefr/],
    ['bad status', { status: 'done' }, /status/],
    ['no senses', { senses: [] }, /senses/],
    ['unknown field', { meaning: 'x' }, /meaning/],
    ['phrase without is_phrase', { lemma: 'bus stop' }, /is_phrase: true/],
    ['is_phrase on one word', { is_phrase: true }, /single word/],
    ['curly apostrophe', { lemma: 'it’s' }, /straight apostrophe/],
    ['duplicate form', { forms: ['runs', 'Runs'] }, /listed twice/],
    ['form equal to lemma', { forms: ['run'] }, /listed twice/],
    [
      'duplicate sense key',
      { senses: [validEntry.senses[0], validEntry.senses[0]] },
      /duplicate sense key "manage"/,
    ],
    ['bad pos', { senses: [{ ...validEntry.senses[0], pos: 'verbish' }] }, /pos/],
    ['empty vi', { senses: [{ ...validEntry.senses[0], vi: ' ' }] }, /vi/],
  ])('rejects %s', (_name, patch, expected) => {
    const r = dictionaryEntrySchema.safeParse({ ...validEntry, ...patch });
    expect(r.success).toBe(false);
    expect(messages(r).join('\n')).toMatch(expected);
  });
});

describe('lessonSchema', () => {
  it('accepts a reading lesson and fills defaults', () => {
    const r = lessonSchema.parse(validReading);
    expect(r.order).toBe(0);
    expect(r.dictation).toEqual([]);
  });

  it('accepts a listening lesson without audio, translations or timings', () => {
    const r = lessonSchema.parse({
      ...validListening,
      segments: validListening.segments.map(({ id, speaker, text_en }) => ({
        id,
        speaker,
        text_en,
      })),
    });
    expect(r.segments[0]!.text_vi).toBeUndefined();
    expect(r.dictation[0]!.answer).toBe('late');
  });

  it.each([
    ['unknown kind', { kind: 'speaking' }, /kind/],
    ['unknown level', { level: 'C1' }, /level/],
    ['no segments', { segments: [] }, /segments/],
    ['bad senses key', { senses: { 'run#0': 'manage' } }, /senses\.run#0/],
    ['bad sense value', { senses: { run: 'Manage It' } }, /senses/],
    ['unknown field', { glossary: [] }, /glossary/],
    ['duplicate focus word', { focus_words: ['run', 'Run'] }, /duplicate focus word/],
    [
      'correct out of range',
      { questions: [{ prompt: 'Q', options: ['A', 'B'], correct: 2 }] },
      /correct/,
    ],
    [
      'unknown evidence',
      { questions: [{ prompt: 'Q', options: ['A', 'B'], correct: 0, evidence: 'x9' }] },
      /unknown segment id "x9"/,
    ],
    [
      'reading segment without translation',
      { segments: [{ id: 's1', paragraph: 1, text_en: 'Hi.' }] },
      /Vietnamese translation/,
    ],
    [
      'reading segment without paragraph',
      { segments: [{ id: 's1', text_en: 'Hi.', text_vi: 'Chào.' }] },
      /paragraph number/,
    ],
    [
      'paragraph gap',
      {
        segments: [
          { id: 's1', paragraph: 1, text_en: 'Hi.', text_vi: 'Chào.' },
          { id: 's2', paragraph: 3, text_en: 'Bye.', text_vi: 'Tạm biệt.' },
        ],
      },
      /increase by 1/,
    ],
    [
      'duplicate segment id',
      {
        segments: [
          { id: 's1', paragraph: 1, text_en: 'Hi.', text_vi: 'Chào.' },
          { id: 's1', paragraph: 1, text_en: 'Bye.', text_vi: 'Tạm biệt.' },
        ],
      },
      /duplicate segment id/,
    ],
    [
      'dictation in reading',
      { dictation: [{ segment: 'p1s1', answer: 'run' }] },
      /only for listening/,
    ],
  ])('rejects reading lesson: %s', (_name, patch, expected) => {
    const r = lessonSchema.safeParse({ ...validReading, ...patch });
    expect(r.success).toBe(false);
    expect(messages(r).join('\n')).toMatch(expected);
  });

  it.each([
    ['segment without speaker', { segments: [{ id: 'l1', text_en: 'Hi.' }] }, /speaker/],
    ['unknown speaker', { segments: [{ id: 'l1', speaker: 'C', text_en: 'Hi.' }] }, /speaker/],
    [
      'paragraph in listening',
      { segments: [{ id: 'l1', speaker: 'A', paragraph: 1, text_en: 'Hi.' }] },
      /only for reading/,
    ],
    [
      'end before start',
      { segments: [{ id: 'l1', speaker: 'A', text_en: 'Hi.', start_ms: 500, end_ms: 100 }] },
      /end_ms/,
    ],
    [
      'dictation with unknown segment',
      { dictation: [{ segment: 'l9', answer: 'late' }] },
      /unknown segment id "l9"/,
    ],
    [
      'dictation answer not in the segment',
      {
        dictation: [
          { segment: 'l2', before: 'It’s running twenty minutes', answer: 'early', after: '.' },
        ],
      },
      /does not match segment "l2"/,
    ],
    [
      'dictation answer is only part of a word',
      { dictation: [{ segment: 'l2', before: 'It’s running twenty', answer: 'min' }] },
      /does not match segment "l2"/,
    ],
    [
      'dictation after text does not follow',
      {
        dictation: [
          { segment: 'l2', before: 'It’s running twenty', answer: 'minutes', after: 'early.' },
        ],
      },
      /does not match segment "l2"/,
    ],
  ])('rejects listening lesson: %s', (_name, patch, expected) => {
    const r = lessonSchema.safeParse({ ...validListening, ...patch });
    expect(r.success).toBe(false);
    expect(messages(r).join('\n')).toMatch(expected);
  });
});

describe('dailyPlanSchema', () => {
  it('accepts days with lesson slugs', () => {
    expect(
      dailyPlanSchema.safeParse({ days: [{ day: 1, reading: 'a', listening: 'b' }] }).success,
    ).toBe(true);
  });

  it('rejects duplicate and empty days', () => {
    const r = dailyPlanSchema.safeParse({ days: [{ day: 1, reading: 'a' }, { day: 1 }] });
    expect(messages(r).join('\n')).toMatch(/duplicate day 1/);
    expect(messages(r).join('\n')).toMatch(/needs a reading or a listening/);
  });
});

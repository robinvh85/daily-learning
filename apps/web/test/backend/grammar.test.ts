import type { GrammarSummary } from '@daily-learning/shared/api';
import type { GrammarExerciseData } from '@daily-learning/shared/content-data';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../src/api/errors';
import { checkGrammarAnswer } from '../../src/backend/grammarHandlers';
import { grammarStep } from '../../src/backend/logic/dailyPlan';

const base = { id: 1, idx: 0, explain: 'x' };
const choice: GrammarExerciseData = {
  ...base,
  type: 'choice',
  prompt: 'We ___ home.',
  options: ['walk', 'walked'],
  correctIdx: 1,
};
const gap: GrammarExerciseData = {
  ...base,
  type: 'gap',
  prompt: 'She ___ (not / like) it.',
  answer: "didn't like",
  accept: ['did not like'],
};
const order: GrammarExerciseData = {
  ...base,
  type: 'order',
  words: ['you', 'did', 'call'],
  answer: 'Did you call?',
};
const findError: GrammarExerciseData = {
  ...base,
  type: 'find_error',
  sentence: 'I watch it yesterday.',
  wrong: 'watch',
  right: 'watched',
};

describe('checkGrammarAnswer', () => {
  it('checks a choice by index and rejects a bad index', () => {
    expect(checkGrammarAnswer(choice, { value: 1 })).toEqual({ correct: true, expected: 'walked' });
    expect(checkGrammarAnswer(choice, { value: 0 }).correct).toBe(false);
    expect(() => checkGrammarAnswer(choice, { value: 5 })).toThrow(ApiRequestError);
    expect(() => checkGrammarAnswer(choice, { value: 'walked' })).toThrow(ApiRequestError);
  });

  it('accepts the answer or an accepted variant, ignoring case, apostrophes and spaces', () => {
    expect(checkGrammarAnswer(gap, { value: 'Didn’t  like' }).correct).toBe(true);
    expect(checkGrammarAnswer(gap, { value: 'did not like' }).correct).toBe(true);
    expect(checkGrammarAnswer(gap, { value: 'not liked' })).toEqual({
      correct: false,
      expected: "didn't like",
    });
  });

  it('compares a built sentence without its punctuation', () => {
    expect(checkGrammarAnswer(order, { value: 'Did you call' }).correct).toBe(true);
    expect(checkGrammarAnswer(order, { value: 'You did call' }).correct).toBe(false);
  });

  it('needs both the wrong part and its correction', () => {
    expect(checkGrammarAnswer(findError, { value: 'watch', correction: 'Watched' })).toEqual({
      correct: true,
      expected: 'watch → watched',
    });
    expect(checkGrammarAnswer(findError, { value: 'it', correction: 'watched' }).correct).toBe(
      false,
    );
    expect(checkGrammarAnswer(findError, { value: 'watch' }).correct).toBe(false);
  });
});

describe('grammarStep', () => {
  const point: GrammarSummary = {
    id: 1,
    slug: 'past-simple-regular',
    title: 'Quá khứ đơn',
    titleEn: 'Past simple',
    level: 'A2',
    group: 'tenses',
    summary: '-',
    draft: false,
    exerciseCount: 8,
    days: [2],
    progress: null,
  };

  it('links to the grammar page and estimates the time from the exercises', () => {
    expect(grammarStep(point)).toMatchObject({
      kind: 'grammar',
      status: 'not_started',
      progressPct: 0,
      minutes: 6,
      url: '/grammar/past-simple-regular',
      grammar: point,
    });
  });

  it('follows the progress', () => {
    const at = (status: 'in_progress' | 'completed', step: number) =>
      grammarStep({
        ...point,
        progress: { status, step, score: null, completedAt: null },
      });
    expect(at('in_progress', 0)).toMatchObject({ status: 'in_progress', progressPct: 10 });
    expect(at('in_progress', 2)).toMatchObject({ status: 'in_progress', progressPct: 67 });
    expect(at('completed', 2)).toMatchObject({ status: 'done', progressPct: 100 });
  });
});

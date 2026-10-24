import type { TokenDto, WordDto } from '@daily-learning/shared/api';

export const runWord: WordDto = {
  id: 7,
  lemma: 'run',
  ipaUs: '/rʌn/',
  cefr: 'A1',
  isPhrase: false,
  status: 'draft',
  audioPath: null,
  senses: [
    {
      id: 70,
      key: 'move',
      pos: 'verb',
      meaningVi: 'chạy',
      definitionEn: 'to move quickly on foot',
      collocations: ['run fast'],
      example: 'I ran to catch the bus.',
    },
    {
      id: 71,
      key: 'manage',
      pos: 'verb',
      meaningVi: 'điều hành, quản lý (cửa hàng, công ty)',
      definitionEn: 'to be in charge of a business',
      collocations: ['run a business', 'run a shop'],
      example: 'She wants to run her own business.',
    },
  ],
};

/** "she wants to run her own business." with tokens for she/wants/run/business. */
export const sentence = 'She wants to run her own business.';
export const tokens: TokenDto[] = [
  { idx: 0, surface: 'She', start: 0, end: 3, wordId: 1, senseId: 10 },
  { idx: 1, surface: 'wants', start: 4, end: 9, wordId: 2, senseId: 20 },
  { idx: 2, surface: 'run', start: 13, end: 16, wordId: 7, senseId: 71 },
  { idx: 3, surface: 'business', start: 25, end: 33, wordId: 9, senseId: 90 },
];

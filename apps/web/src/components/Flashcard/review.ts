/** Review card actions shared by the card buttons and the page shortcuts. */
import type { ReviewRating } from '@daily-learning/shared';
import type { ReviewCardDto } from '@daily-learning/shared/api';
import { playClip, playUrl } from '../../lib/playUrl';

export type ReviewChoice = ReviewRating | 'postpone';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The answer buttons of `card` in screen order; number key n picks the n-th. "Mai ôn" only shows
 * when Nhớ is further than a day away: otherwise (a new word, a word just forgotten) Nhớ already
 * means tomorrow and the two buttons would do the same.
 */
export function reviewChoices(card: ReviewCardDto, nowMs = Date.now()): readonly ReviewChoice[] {
  const good = card.previews.find((p) => p.rating === 3);
  const goodInMs = good ? new Date(good.due).getTime() - nowMs : NaN;
  return goodInMs > DAY_MS ? [1, 2, 'postpone', 3, 4] : [1, 2, 3, 4];
}

/** Play the word's pronunciation; false when it has no audio. */
export function playWord(card: ReviewCardDto): boolean {
  if (!card.audioUrl) return false;
  playUrl(card.audioUrl);
  return true;
}

/** Play the example sentence from the lesson audio; false when it has none. */
export function playExample(card: ReviewCardDto): boolean {
  const a = card.exampleAudio;
  if (!a) return false;
  playClip(a.url, a.startMs, a.endMs);
  return true;
}

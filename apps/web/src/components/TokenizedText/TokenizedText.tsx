/**
 * Renders one segment's English text from its pre-computed tokens (plan 2.5). Every dictionary
 * word is a real <button>; focus words get a dotted underline; tokens of the selected word are
 * highlighted. Used by the reading article and (Phase 3) the listening transcript.
 */
import type { TokenDto } from '@daily-learning/shared/api';
import type { ReactNode } from 'react';
import styles from './TokenizedText.module.css';

export interface TokenizedTextProps {
  text: string;
  tokens: readonly TokenDto[];
  /** Word ids of the lesson's focus words. */
  focusWordIds?: ReadonlySet<number>;
  selectedWordId?: number | null;
  onSelect?: (token: TokenDto) => void;
}

export function TokenizedText({
  text,
  tokens,
  focusWordIds,
  selectedWordId = null,
  onSelect,
}: TokenizedTextProps) {
  const parts: ReactNode[] = [];
  let pos = 0;
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  for (const t of sorted) {
    if (t.start < pos) continue; // overlapping token: keep the first one
    if (t.start > pos) parts.push(text.slice(pos, t.start));
    const focus = focusWordIds?.has(t.wordId) ?? false;
    const selected = t.wordId === selectedWordId;
    const className = [styles.word, focus && styles.focus, selected && styles.selected]
      .filter(Boolean)
      .join(' ');
    parts.push(
      <button
        key={t.idx}
        type="button"
        className={className}
        aria-pressed={selected}
        data-word-id={t.wordId}
        onClick={() => onSelect?.(t)}
      >
        {text.slice(t.start, t.end)}
      </button>,
    );
    pos = t.end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

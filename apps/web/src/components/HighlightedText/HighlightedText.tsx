/** A sentence with some parts marked (grammar examples): each range becomes a <mark>. */
import type { ReactNode } from 'react';
import styles from './HighlightedText.module.css';

export interface HighlightedTextProps {
  text: string;
  /** UTF-16 offsets `[start, end)`, sorted and not overlapping. */
  ranges: readonly (readonly [number, number])[];
}

export function HighlightedText({ text, ranges }: HighlightedTextProps) {
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start < pos || end > text.length || end <= start) continue;
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark key={start} className={styles.mark}>
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

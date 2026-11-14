/**
 * "Ngữ pháp trong bài" (grammar plan 3.2): which sentence parts to underline in a lesson and which
 * grammar mark is open in the grammar card.
 *
 * A lesson of a plan day shows only the marks of that day's grammar point (on by default); a
 * lesson outside the plan shows every mark (off by default).
 */
import type {
  LessonDetailResponse,
  LessonGrammarMarkDto,
  LessonGrammarPointDto,
  SegmentDto,
  TokenDto,
} from '@daily-learning/shared/api';
import { useMemo, useState } from 'react';

export interface OpenGrammarMark {
  mark: LessonGrammarMarkDto;
  point: LessonGrammarPointDto;
  /** The underlined words (parts joined with " … "). */
  quote: string;
}

export interface LessonGrammar {
  /** The lesson has marks to show (the toggle is offered). */
  available: boolean;
  on: boolean;
  toggle: () => void;
  /** Ranges to underline per segment id (empty while off). */
  ranges: ReadonlyMap<number, readonly (readonly [number, number])[]>;
  /** Grammar point slugs shown, for the toggle label. */
  points: LessonGrammarPointDto[];
  open: OpenGrammarMark | null;
  /** Open the mark under a clicked token; returns false when the token is not in a mark. */
  openAt: (segment: Pick<SegmentDto, 'id' | 'textEn'>, token: TokenDto) => boolean;
  close: () => void;
}

const overlaps = (t: TokenDto, [s, e]: readonly [number, number]) => t.start < e && t.end > s;

export function useLessonGrammar(
  data: Pick<LessonDetailResponse, 'grammar' | 'grammarPoints' | 'dayGrammar'>,
): LessonGrammar {
  const { grammar, grammarPoints, dayGrammar } = data;
  const visible = useMemo(
    () => (dayGrammar ? grammar.filter((m) => m.point === dayGrammar) : grammar),
    [grammar, dayGrammar],
  );
  const [on, setOn] = useState(dayGrammar !== null && visible.length > 0);
  const [open, setOpen] = useState<OpenGrammarMark | null>(null);

  const ranges = useMemo(() => {
    const map = new Map<number, (readonly [number, number])[]>();
    if (!on) return map;
    for (const m of visible) map.set(m.segmentId, [...(map.get(m.segmentId) ?? []), ...m.ranges]);
    return map;
  }, [on, visible]);

  const points = useMemo(
    () =>
      [...new Set(visible.map((m) => m.point))]
        .map((slug) => grammarPoints[slug])
        .filter((p): p is LessonGrammarPointDto => p !== undefined),
    [visible, grammarPoints],
  );

  return {
    available: visible.length > 0,
    on,
    toggle: () => {
      setOn((v) => !v);
      setOpen(null);
    },
    ranges,
    points,
    open,
    openAt: (segment, token) => {
      if (!on) return false;
      const mark = visible.find(
        (m) => m.segmentId === segment.id && m.ranges.some((r) => overlaps(token, r)),
      );
      const point = mark ? grammarPoints[mark.point] : undefined;
      if (!mark || !point) return false;
      const quote = mark.ranges.map(([s, e]) => segment.textEn.slice(s, e)).join(' … ');
      setOpen({ mark, point, quote });
      return true;
    },
    close: () => setOpen(null),
  };
}

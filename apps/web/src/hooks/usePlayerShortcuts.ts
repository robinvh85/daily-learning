/**
 * Page-wide keyboard shortcuts for a lesson player:
 * - Space or P: play / pause
 * - ←: previous sentence, →: next sentence (only with segment timings)
 *
 * Keys keep their normal meaning while typing (inputs, textareas, contenteditable), with a
 * modifier held, and when a focused widget already handled them (waveform slider, tabs).
 * Space on a focused button or link outside the player activates that control as usual;
 * inside the player (marked with `data-player`) every button is an audio control, so Space
 * plays / pauses instead of repeating the last clicked button.
 */
import { useEffect, useRef } from 'react';
import type { AudioPlayer } from './useAudioPlayer';

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function usePlayerShortcuts(
  player: Pick<AudioPlayer, 'toggle' | 'prev' | 'next'>,
  { enabled, segments }: { enabled: boolean; segments: boolean },
) {
  // Latest values for the listener, so it is bound once per mount.
  const latest = useRef({ player, segments });
  useEffect(() => {
    latest.current = { player, segments };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isEditable(target) || target?.closest('[role="slider"], [role="tab"]')) return;
      const { player: p, segments: hasSegments } = latest.current;
      if (e.key === ' ') {
        const control = target?.closest('button, a, [role="button"]');
        if (control && !control.closest('[data-player]')) return;
        e.preventDefault();
        if (!e.repeat) p.toggle();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (!e.repeat) p.toggle();
        return;
      }
      if (!hasSegments) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        p.prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        p.next();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Static waveform from the peaks in timings.json (plan Phase 3). Bars left of the playhead use
 * the accent colour. It is a slider for keyboard users (←/→ 5 s, Home/End) and each bar seeks
 * on click.
 */
import type { KeyboardEvent } from 'react';
import { formatTime } from '../../lib/time';
import styles from './AudioPlayer.module.css';

export interface WaveformProps {
  peaks: readonly number[];
  currentMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}

const STEP_MS = 5000;

export function Waveform({ peaks, currentMs, durationMs, onSeek }: WaveformProps) {
  const progress = durationMs > 0 ? currentMs / durationMs : 0;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const to: Record<string, number> = {
      ArrowLeft: currentMs - STEP_MS,
      ArrowDown: currentMs - STEP_MS,
      ArrowRight: currentMs + STEP_MS,
      ArrowUp: currentMs + STEP_MS,
      PageDown: currentMs - STEP_MS * 2,
      PageUp: currentMs + STEP_MS * 2,
      Home: 0,
      End: durationMs,
    };
    const ms = to[e.key];
    if (ms === undefined) return;
    e.preventDefault();
    onSeek(Math.min(durationMs, Math.max(0, ms)));
  }

  return (
    <div
      className={styles.wave}
      role="slider"
      tabIndex={0}
      aria-label="Vị trí phát"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(currentMs / 1000)}
      aria-valuetext={`${formatTime(currentMs)} / ${formatTime(durationMs)}`}
      onKeyDown={onKeyDown}
    >
      {peaks.map((p, i) => (
        <div
          key={i}
          className={
            (i + 0.5) / peaks.length <= progress ? `${styles.bar} ${styles.played}` : styles.bar
          }
          style={{ height: `${Math.max(8, Math.round(p * 100))}%` }}
          data-testid="wave-bar"
          onClick={() => onSeek((i / peaks.length) * durationMs)}
        />
      ))}
    </div>
  );
}

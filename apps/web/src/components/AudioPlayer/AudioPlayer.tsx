/** Player card from the mockup (Listening.dc.html): waveform, time, controls and speed. */
import type { AudioPlayer as Player } from '../../hooks/useAudioPlayer';
import { SPEEDS } from '../../hooks/useAudioPlayer';
import { formatTime } from '../../lib/time';
import { PauseIcon, PlayIcon } from '../Icons';
import styles from './AudioPlayer.module.css';
import { Waveform } from './Waveform';

export interface AudioPlayerProps {
  player: Player;
  peaks: readonly number[] | null;
  /** False when the lesson has audio but no segment timings. */
  hasSegments: boolean;
}

export function AudioPlayer({ player, peaks, hasSegments }: AudioPlayerProps) {
  return (
    <section aria-label="Trình phát" className={styles.player} data-player>
      {peaks && peaks.length > 0 ? (
        <Waveform
          peaks={peaks}
          currentMs={player.currentMs}
          durationMs={player.durationMs}
          onSeek={player.seek}
        />
      ) : (
        <input
          type="range"
          className={styles.range}
          aria-label="Vị trí phát"
          min={0}
          max={Math.max(1, Math.round(player.durationMs))}
          value={Math.round(player.currentMs)}
          onChange={(e) => player.seek(Number(e.target.value))}
        />
      )}
      <div className={styles.times} aria-live="off">
        <span data-testid="current-time">{formatTime(player.currentMs)}</span>
        <span>{formatTime(player.durationMs)}</span>
      </div>
      {player.error && (
        <p role="alert" className={styles.error}>
          Không tải được file audio. Chạy lại <code>npm run content:build</code> rồi tải lại trang.
        </p>
      )}
      <div className={styles.controls}>
        <div className={styles.transport}>
          <button
            type="button"
            className={styles.btn}
            title="Câu trước (←)"
            aria-keyshortcuts="ArrowLeft"
            onClick={player.prev}
            disabled={!hasSegments}
          >
            Câu trước
          </button>
          <button
            type="button"
            className={styles.play}
            aria-label={player.playing ? 'Tạm dừng' : 'Phát'}
            title={player.playing ? 'Tạm dừng (Space)' : 'Phát (Space)'}
            aria-keyshortcuts="Space"
            onClick={player.toggle}
          >
            {player.playing ? <PauseIcon /> : <PlayIcon size={22} />}
          </button>
          <button
            type="button"
            className={styles.btn}
            title="Câu sau (→)"
            aria-keyshortcuts="ArrowRight"
            onClick={player.next}
            disabled={!hasSegments}
          >
            Câu sau
          </button>
          <button
            type="button"
            className={player.loop ? `${styles.btn} ${styles.loopOn}` : styles.btn}
            aria-pressed={player.loop}
            onClick={() => player.setLoop(!player.loop)}
            disabled={!hasSegments}
          >
            Lặp câu
          </button>
        </div>
        <div role="group" aria-label="Tốc độ" className={styles.speeds}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={player.rate === s ? `${styles.speed} ${styles.speedOn}` : styles.speed}
              aria-pressed={player.rate === s}
              onClick={() => player.setRate(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <p className={styles.keysHint}>
        Phím tắt: <kbd>Space</kbd> / <kbd>P</kbd> nghe / tạm dừng
        {hasSegments && (
          <>
            {' · '}
            <kbd>←</kbd> câu trước · <kbd>→</kbd> câu sau
          </>
        )}
      </p>
    </section>
  );
}

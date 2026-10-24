/**
 * One `<audio>` element driven by React state: play/pause, seek, speed (`playbackRate`),
 * previous/next segment, loop the current segment, and play a single segment.
 *
 * Segments come from timings.json (`startMs`/`endMs`). The current segment is the last one that
 * started at or before the playhead, so the silence after a segment still belongs to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TimedSegment {
  startMs: number;
  endMs: number;
}

export const SPEEDS = [0.75, 1, 1.25] as const;
/** "Câu trước" restarts the current segment when more than this has been played. */
const RESTART_MS = 1500;

export function segmentIndexAt(segments: readonly TimedSegment[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.startMs <= ms + 1) idx = i;
    else break;
  }
  return idx;
}

export interface AudioPlayer {
  playing: boolean;
  currentMs: number;
  durationMs: number;
  rate: number;
  loop: boolean;
  /** Index of the current segment, or -1 before the first one / without timings. */
  current: number;
  error: boolean;
  toggle: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  /** Seek to a segment start and keep playing (or start). */
  seekSegment: (index: number) => void;
  /** Play only this segment, then pause. */
  playSegment: (index: number) => void;
  prev: () => void;
  next: () => void;
  setRate: (rate: number) => void;
  setLoop: (loop: boolean) => void;
}

export function useAudioPlayer(
  src: string | null,
  segments: readonly TimedSegment[],
  knownDurationMs: number | null = null,
): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(knownDurationMs ?? 0);
  const [rate, setRateState] = useState(1);
  const [loop, setLoopState] = useState(false);
  const [error, setError] = useState(false);
  // Read inside the animation frame loop without re-subscribing.
  const segmentsRef = useRef(segments);
  const loopRef = useRef(loop);
  const stopAtRef = useRef<number | null>(null);
  useEffect(() => {
    segmentsRef.current = segments;
    loopRef.current = loop;
  });

  useEffect(() => {
    if (!src) return;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;
    const onTime = () => setCurrentMs(audio.currentTime * 1000);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDurationMs(audio.duration * 1000);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const segs = segmentsRef.current;
      if (loopRef.current && segs.length > 0) {
        audio.currentTime = segs[segs.length - 1]!.startMs / 1000;
        void audio.play()?.catch(() => {});
        return;
      }
      setPlaying(false);
    };
    const onError = () => setError(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('seeked', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
    };
  }, [src]);

  // While playing: smooth position updates, segment loop and single-segment stop.
  useEffect(() => {
    const audio = audioRef.current;
    if (!playing || !audio) return;
    let raf = 0;
    const tick = () => {
      const t = audio.currentTime * 1000;
      const stopAt = stopAtRef.current;
      if (stopAt !== null && t >= stopAt) {
        stopAtRef.current = null;
        audio.pause();
      } else if (loopRef.current) {
        const segs = segmentsRef.current;
        const i = segmentIndexAt(segs, t);
        const seg = segs[i];
        if (seg && t >= seg.endMs) audio.currentTime = seg.startMs / 1000;
      }
      setCurrentMs(audio.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    stopAtRef.current = null;
    audio.currentTime = Math.max(0, ms) / 1000;
    setCurrentMs(Math.max(0, ms));
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // play() rejects when the browser blocks it or the file is missing: show it as paused.
    const p = audio.play() as Promise<void> | undefined;
    p?.catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      stopAtRef.current = null;
      play();
    } else {
      audio.pause();
    }
  }, [play]);

  const seekSegment = useCallback(
    (index: number) => {
      const seg = segmentsRef.current[index];
      if (!seg) return;
      seek(seg.startMs);
    },
    [seek],
  );

  const playSegment = useCallback(
    (index: number) => {
      const seg = segmentsRef.current[index];
      if (!seg) return;
      seek(seg.startMs);
      stopAtRef.current = seg.endMs;
      play();
    },
    [play, seek],
  );

  const current = useMemo(() => segmentIndexAt(segments, currentMs), [segments, currentMs]);

  const prev = useCallback(() => {
    const segs = segmentsRef.current;
    const i = segmentIndexAt(segs, (audioRef.current?.currentTime ?? 0) * 1000);
    const seg = segs[i];
    if (seg && currentMs - seg.startMs > RESTART_MS) seekSegment(i);
    else seekSegment(Math.max(0, i - 1));
  }, [currentMs, seekSegment]);

  const next = useCallback(() => {
    const segs = segmentsRef.current;
    const i = segmentIndexAt(segs, (audioRef.current?.currentTime ?? 0) * 1000);
    if (i + 1 < segs.length) seekSegment(i + 1);
  }, [seekSegment]);

  const setRate = useCallback((r: number) => {
    if (audioRef.current) audioRef.current.playbackRate = r;
    setRateState(r);
  }, []);

  const setLoop = useCallback((on: boolean) => setLoopState(on), []);

  return {
    playing,
    currentMs,
    durationMs: durationMs || knownDurationMs || 0,
    rate,
    loop,
    current,
    error,
    toggle,
    pause,
    seek,
    seekSegment,
    playSegment,
    prev,
    next,
    setRate,
    setLoop,
  };
}

/** Segments with timings, in order (empty when the lesson has no timings). */
export function timedSegments<T extends { startMs: number | null; endMs: number | null }>(
  segments: readonly T[],
): (T & TimedSegment)[] {
  if (!segments.every((s) => s.startMs !== null && s.endMs !== null)) return [];
  return segments as (T & TimedSegment)[];
}

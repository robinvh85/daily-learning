/**
 * jsdom has no media playback: replace HTMLMediaElement play/pause/currentTime/playbackRate with
 * a small in-memory implementation that fires the same events.
 */
import { vi } from 'vitest';

interface MediaState {
  paused: boolean;
  time: number;
  rate: number;
}

const state = new WeakMap<HTMLMediaElement, MediaState>();
export const media: HTMLMediaElement[] = [];

function get(el: HTMLMediaElement): MediaState {
  let s = state.get(el);
  if (!s) {
    s = { paused: true, time: 0, rate: 1 };
    state.set(el, s);
    media.push(el);
  }
  return s;
}

export function installMediaStub() {
  media.length = 0;
  const proto = HTMLMediaElement.prototype;
  const originals = {
    play: Object.getOwnPropertyDescriptor(proto, 'play'),
    pause: Object.getOwnPropertyDescriptor(proto, 'pause'),
    paused: Object.getOwnPropertyDescriptor(proto, 'paused'),
    currentTime: Object.getOwnPropertyDescriptor(proto, 'currentTime'),
    playbackRate: Object.getOwnPropertyDescriptor(proto, 'playbackRate'),
    src: Object.getOwnPropertyDescriptor(proto, 'src'),
  };
  const srcDesc = originals.src!;
  Object.defineProperty(proto, 'src', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return srcDesc.get!.call(this);
    },
    set(this: HTMLMediaElement, v: string) {
      srcDesc.set!.call(this, v);
      get(this);
    },
  });
  const play = vi.fn(function (this: HTMLMediaElement) {
    get(this).paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const pause = vi.fn(function (this: HTMLMediaElement) {
    const s = get(this);
    if (s.paused) return;
    s.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  Object.defineProperty(proto, 'play', { configurable: true, value: play });
  Object.defineProperty(proto, 'pause', { configurable: true, value: pause });
  Object.defineProperty(proto, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).paused;
    },
  });
  Object.defineProperty(proto, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).time;
    },
    set(this: HTMLMediaElement, v: number) {
      get(this).time = v;
      this.dispatchEvent(new Event('seeked'));
    },
  });
  Object.defineProperty(proto, 'playbackRate', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).rate;
    },
    set(this: HTMLMediaElement, v: number) {
      get(this).rate = v;
    },
  });
  return {
    play,
    pause,
    restore() {
      for (const [key, desc] of Object.entries(originals)) {
        if (desc) Object.defineProperty(proto, key, desc);
      }
    },
  };
}

/** The most recent media element that has a src (the lesson player). */
export function lastPlayer(): HTMLMediaElement {
  const el = [...media].reverse().find((m) => m.getAttribute('src'));
  if (!el) throw new Error('no media element with a src');
  return el;
}

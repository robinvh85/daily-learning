/**
 * Study time tracking (plan section 5, `POST /api/activity/heartbeat`).
 *
 * Time counts only while the tab is visible AND the learner did something in the last 60 s
 * (pointer, key, scroll) or audio is playing. Counted seconds are sent every 30 s; what is left
 * is sent with `navigator.sendBeacon` when the tab is hidden or the page is closed.
 */
import { API_PREFIX } from '@daily-learning/shared';
import { useEffect } from 'react';

export const HEARTBEAT_URL = `${API_PREFIX}/activity/heartbeat`;
/** Send a heartbeat after this many counted seconds. */
export const HEARTBEAT_EVERY_S = 30;
/** No interaction for this long → stop counting. */
export const IDLE_AFTER_MS = 60_000;
const TICK_MS = 1000;

const INTERACTIONS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;
/** Media events do not bubble, so they are caught in the capture phase. */
const MEDIA_ON = ['play', 'playing', 'timeupdate'] as const;
const MEDIA_OFF = ['pause', 'ended', 'emptied'] as const;

function post(seconds: number): void {
  void fetch(HEARTBEAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seconds }),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Offline or server down: this slice of time is lost, which is acceptable.
  });
}

function beacon(seconds: number): void {
  const body = JSON.stringify({ seconds });
  // A JSON Blob makes the beacon a `content-type: application/json` POST.
  const blob = new Blob([body], { type: 'application/json' });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(HEARTBEAT_URL, blob)) {
    return;
  }
  post(seconds);
}

export function useStudyTimer(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let lastInteraction = Date.now();
    let audioPlaying = false;
    let lastTick = Date.now();
    let pendingMs = 0;

    const visible = () => document.visibilityState === 'visible';
    const touch = () => {
      lastInteraction = Date.now();
    };
    const mediaOn = () => {
      audioPlaying = true;
      lastInteraction = Date.now();
    };
    const mediaOff = () => {
      audioPlaying = false;
    };

    const flush = (final: boolean) => {
      const seconds = Math.round(pendingMs / 1000);
      if (seconds <= 0) return;
      pendingMs -= seconds * 1000;
      if (final) beacon(seconds);
      else post(seconds);
    };

    const tick = () => {
      const now = Date.now();
      // Cap one tick, so a sleeping laptop or a throttled background tab adds nothing.
      const elapsed = Math.min(now - lastTick, TICK_MS * 2);
      lastTick = now;
      const active = audioPlaying || now - lastInteraction < IDLE_AFTER_MS;
      if (visible() && active) pendingMs += elapsed;
      if (pendingMs >= HEARTBEAT_EVERY_S * 1000) flush(false);
    };

    const onHide = () => {
      tick();
      flush(true);
    };
    const onVisibility = () => {
      if (visible()) {
        lastTick = Date.now();
        touch();
      } else onHide();
    };

    const id = window.setInterval(tick, TICK_MS);
    for (const e of INTERACTIONS)
      window.addEventListener(e, touch, { passive: true, capture: true });
    for (const e of MEDIA_ON) document.addEventListener(e, mediaOn, true);
    for (const e of MEDIA_OFF) document.addEventListener(e, mediaOff, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      window.clearInterval(id);
      for (const e of INTERACTIONS) window.removeEventListener(e, touch, { capture: true });
      for (const e of MEDIA_ON) document.removeEventListener(e, mediaOn, true);
      for (const e of MEDIA_OFF) document.removeEventListener(e, mediaOff, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [enabled]);
}

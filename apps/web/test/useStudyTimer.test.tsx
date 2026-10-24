import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_URL, useStudyTimer } from '../src/hooks/useStudyTimer';

function Timer() {
  useStudyTimer(true);
  return null;
}

let visibility: DocumentVisibilityState = 'visible';
let fetchMock: ReturnType<typeof vi.fn>;
let beaconMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetchMock);
  beaconMock = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beaconMock, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const sentSeconds = () =>
  fetchMock.mock.calls.map(([url, init]) => {
    expect(url).toBe(HEARTBEAT_URL);
    return (JSON.parse((init as RequestInit).body as string) as { seconds: number }).seconds;
  });

describe('useStudyTimer', () => {
  it('sends a heartbeat every 30 s while visible and active', () => {
    render(<Timer />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sentSeconds()).toEqual([30]);
  });

  it('stops counting after 60 s without interaction, and resumes on a key press', () => {
    render(<Timer />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    // Only the first ~60 s counted (30 sent, ~29 still pending), then nothing while idle.
    expect(sentSeconds()).toEqual([30]);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
      vi.advanceTimersByTime(31_000);
    });
    expect(sentSeconds()).toEqual([30, 30, 30]);
  });

  it('keeps counting while audio plays without other interaction', () => {
    render(<Timer />);
    act(() => {
      document.dispatchEvent(new Event('play'));
      vi.advanceTimersByTime(90_000);
    });
    expect(sentSeconds()).toEqual([30, 30, 30]);
  });

  it('does not count while the tab is hidden and sends the rest with sendBeacon', async () => {
    render(<Timer />);
    act(() => {
      vi.advanceTimersByTime(12_000);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(beaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconMock.mock.calls[0] as [string, Blob];
    expect(url).toBe(HEARTBEAT_URL);
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ seconds: 12 });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

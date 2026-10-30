/**
 * Play a short clip (word pronunciation, an example sentence cut from the lesson audio). One
 * shared element, so clicks never overlap.
 */
let shared: HTMLAudioElement | null = null;
/** Stops the current slice at its end; removed when another clip starts. */
let stopAtEnd: (() => void) | null = null;

function element(): HTMLAudioElement {
  if (!shared) shared = new Audio();
  shared.pause();
  if (stopAtEnd) shared.removeEventListener('timeupdate', stopAtEnd);
  stopAtEnd = null;
  return shared;
}

function start(audio: HTMLAudioElement): void {
  const p = audio.play() as Promise<void> | undefined;
  p?.catch(() => {
    // Blocked or missing file: nothing to do, the button simply does not play.
  });
}

export function playUrl(url: string): void {
  const audio = element();
  audio.src = url;
  start(audio);
}

/** Play `url` from `startMs` to `endMs` (one sentence of a lesson recording). */
export function playClip(url: string, startMs: number, endMs: number): void {
  const audio = element();
  const stop = () => {
    if (audio.currentTime * 1000 >= endMs) {
      audio.pause();
      audio.removeEventListener('timeupdate', stop);
    }
  };
  stopAtEnd = stop;
  audio.addEventListener('timeupdate', stop);
  // Same file again (cached): seek right away; otherwise once the metadata is known.
  if (audio.src && audio.src.endsWith(url) && audio.readyState >= 1) {
    audio.currentTime = startMs / 1000;
    start(audio);
    return;
  }
  audio.src = url;
  audio.addEventListener(
    'loadedmetadata',
    () => {
      audio.currentTime = startMs / 1000;
    },
    { once: true },
  );
  audio.currentTime = startMs / 1000;
  start(audio);
}

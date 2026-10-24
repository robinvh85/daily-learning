/** Play a short clip (word pronunciation). One shared element, so clicks never overlap. */
let shared: HTMLAudioElement | null = null;

export function playUrl(url: string): void {
  if (!shared) shared = new Audio();
  shared.pause();
  shared.src = url;
  const p = shared.play() as Promise<void> | undefined;
  p?.catch(() => {
    // Blocked or missing file: nothing to do, the button simply does not play.
  });
}

/**
 * Google Cloud Text-to-Speech over REST with an API key (plan 2.4).
 *
 *   POST https://texttospeech.googleapis.com/v1/text:synthesize?key=…
 *   GET  https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=…
 *
 * The key is only ever placed in the request URL. Error messages are built from the HTTP status
 * and Google's error message, and any occurrence of the key is redacted, so it never reaches the
 * console, logs or thrown errors.
 */
import { TtsApiError, type SynthesizeRequest, type TtsProvider } from './provider.js';
import { TIER_FEATURES, type VoiceInfo } from './voices.js';

export const GOOGLE_TTS_BASE = 'https://texttospeech.googleapis.com/v1';

export interface GoogleProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Retries for 429 / 5xx (default 3). */
  retries?: number;
  /** First retry delay in ms, doubled each time (default 2000). */
  retryDelayMs?: number;
}

/** Body of `text:synthesize` for one segment. Plain text only (no SSML for any tier). */
export function synthesizeBody(req: SynthesizeRequest) {
  const audioConfig: { audioEncoding: 'MP3'; sampleRateHertz: number; speakingRate?: number } = {
    audioEncoding: 'MP3',
    sampleRateHertz: 24000,
  };
  if (TIER_FEATURES[req.tier].speakingRate && req.speakingRate !== undefined) {
    audioConfig.speakingRate = req.speakingRate;
  }
  return {
    input: { text: req.text },
    voice: { languageCode: 'en-US', name: req.voice },
    audioConfig,
  };
}

const HINTS: Record<number, string> = {
  400: 'bad request (check the voice name and the text)',
  401: 'API key missing or invalid (GOOGLE_TTS_API_KEY in .env)',
  403: 'access denied: check GOOGLE_TTS_API_KEY, that the Text-to-Speech API is enabled and that the key is allowed to call it',
  404: 'not found (check the voice name)',
  429: 'quota or rate limit exceeded, try again later',
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createGoogleProvider(opts: GoogleProviderOptions): TtsProvider {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY is empty. Put your API key in .env.');
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 3;
  const retryDelay = opts.retryDelayMs ?? 2000;

  const redact = (s: string) => s.split(apiKey).join('[redacted]');

  async function call(what: string, path: string, init: RequestInit): Promise<unknown> {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${GOOGLE_TTS_BASE}/${path}${sep}key=${encodeURIComponent(apiKey)}`;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, init);
      } catch (err) {
        // Network errors may include the URL: never pass the original message through unredacted.
        throw new TtsApiError(
          0,
          `${what}: network error: ${redact(String((err as Error).message))}`,
        );
      }
      if (res.ok) return res.json();

      let detail = '';
      try {
        const body = (await res.json()) as { error?: { message?: string; status?: string } };
        detail = [body.error?.status, body.error?.message].filter(Boolean).join(': ');
      } catch {
        // Not JSON.
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        await sleep(retryDelay * 2 ** attempt);
        continue;
      }
      const hint = HINTS[res.status] ?? 'request failed';
      throw new TtsApiError(
        res.status,
        redact(`${what}: HTTP ${res.status}, ${hint}${detail ? ` (${detail})` : ''}`),
      );
    }
  }

  return {
    name: 'google',
    async synthesize(req) {
      const json = (await call(`synthesize ${req.voice}`, 'text:synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(synthesizeBody(req)),
      })) as { audioContent?: string };
      if (!json.audioContent) {
        throw new TtsApiError(200, `synthesize ${req.voice}: response has no audioContent`);
      }
      const audio = Buffer.from(json.audioContent, 'base64');
      if (audio.length === 0) {
        throw new TtsApiError(200, `synthesize ${req.voice}: empty audioContent`);
      }
      return audio;
    },
    async listVoices(languageCode) {
      const json = (await call(
        'list voices',
        `voices?languageCode=${encodeURIComponent(languageCode)}`,
        {
          method: 'GET',
        },
      )) as { voices?: VoiceInfo[] };
      return json.voices ?? [];
    },
  };
}

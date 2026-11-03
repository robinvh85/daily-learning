import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGoogleProvider, synthesizeBody } from '../src/content/tts/google.js';
import { TtsApiError } from '../src/content/tts/provider.js';

const KEY = 'AIzaTEST-secret-key_123';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  return fn;
}

afterEach(() => vi.restoreAllMocks());

describe('synthesizeBody', () => {
  it('sends plain text, en-US, MP3 24 kHz and speakingRate for Neural2', () => {
    expect(
      synthesizeBody({
        text: 'Hello.',
        voice: 'en-US-Neural2-F',
        tier: 'neural2',
        speakingRate: 0.9,
      }),
    ).toEqual({
      input: { text: 'Hello.' },
      voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 0.9 },
    });
  });

  it('omits speakingRate for Chirp 3 HD', () => {
    const body = synthesizeBody({
      text: 'Hi.',
      voice: 'en-US-Chirp3-HD-Aoede',
      tier: 'chirp3-hd',
      speakingRate: 0.9,
    });
    expect(body.audioConfig).toEqual({ audioEncoding: 'MP3', sampleRateHertz: 24000 });
    expect(JSON.stringify(body)).not.toContain('ssml');
  });
});

describe('createGoogleProvider', () => {
  it('POSTs to text:synthesize with the key in the query and decodes base64 audio', async () => {
    const audio = Buffer.from('ID3 fake mp3 bytes');
    const fetchFn = mockFetch(jsonResponse(200, { audioContent: audio.toString('base64') }));
    const p = createGoogleProvider({ apiKey: KEY, fetch: fetchFn });
    const out = await p.synthesize({
      text: 'Platform 4.',
      voice: 'en-US-Wavenet-D',
      tier: 'wavenet',
      speakingRate: 1,
    });
    expect(out.equals(audio)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(KEY)}`,
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      input: { text: 'Platform 4.' },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 1 },
    });
  });

  it('lists voices with GET voices?languageCode=en-US', async () => {
    const voices = [
      {
        name: 'en-US-Neural2-F',
        languageCodes: ['en-US'],
        ssmlGender: 'FEMALE',
        naturalSampleRateHertz: 24000,
      },
    ];
    const fetchFn = mockFetch(jsonResponse(200, { voices }));
    const p = createGoogleProvider({ apiKey: KEY, fetch: fetchFn });
    expect(await p.listVoices('en-US')).toEqual(voices);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${encodeURIComponent(KEY)}`,
    );
    expect(init?.method).toBe('GET');
  });

  it.each([
    [400, 'INVALID_ARGUMENT', /HTTP 400, bad request/],
    [403, 'PERMISSION_DENIED', /HTTP 403, access denied/],
    [429, 'RESOURCE_EXHAUSTED', /HTTP 429, quota or rate limit exceeded/],
  ])('turns HTTP %i into a TtsApiError without the key', async (status, code, pattern) => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    // Google echoes request details in some messages: make sure the key is redacted.
    const body = { error: { code: status, status: code, message: `Problem with key ${KEY}` } };
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(status, body));
    const p = createGoogleProvider({ apiKey: KEY, fetch: fetchFn, retries: 2, retryDelayMs: 0 });
    const err = await p
      .synthesize({ text: 'x', voice: 'en-US-Neural2-F', tier: 'neural2' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TtsApiError);
    expect((err as TtsApiError).status).toBe(status);
    expect((err as Error).message).toMatch(pattern);
    expect((err as Error).message).toContain(code);
    expect((err as Error).message).not.toContain(KEY);
    expect((err as Error).message).toContain('[redacted]');
    expect(String((err as Error).stack)).not.toContain(KEY);
    // 429 is retried (retries + 1 attempts), 400 / 403 are not.
    expect(fetchFn).toHaveBeenCalledTimes(status === 429 ? 3 : 1);
    for (const spy of [log, error, warn]) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(KEY);
    }
  });

  it('retries a 429 and succeeds', async () => {
    const fetchFn = mockFetch(
      jsonResponse(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'slow down' } }),
      jsonResponse(200, { audioContent: Buffer.from('ok').toString('base64') }),
    );
    const p = createGoogleProvider({ apiKey: KEY, fetch: fetchFn, retryDelayMs: 0 });
    const out = await p.synthesize({ text: 'x', voice: 'en-US-Neural2-F', tier: 'neural2' });
    expect(out.toString()).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('redacts the key from network errors', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      throw new TypeError(`fetch failed for ${String(url)}`);
    });
    const p = createGoogleProvider({ apiKey: KEY, fetch: fetchFn });
    const err = (await p.listVoices('en-US').catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/network error/);
    expect(err.message).not.toContain(KEY);
  });

  it('rejects an empty key and a response without audio', async () => {
    expect(() => createGoogleProvider({ apiKey: '  ' })).toThrow(/GOOGLE_TTS_API_KEY/);
    const p = createGoogleProvider({ apiKey: KEY, fetch: mockFetch(jsonResponse(200, {})) });
    await expect(
      p.synthesize({ text: 'x', voice: 'en-US-Neural2-F', tier: 'neural2' }),
    ).rejects.toThrow(/no audioContent/);
  });
});

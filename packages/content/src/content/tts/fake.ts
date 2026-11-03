/**
 * Fake TTS provider: a short ffmpeg tone per text, length proportional to the text, so the whole
 * pipeline (cache, concat, timings, peaks, sync, player) can be tested without network access.
 * Never write its output into the real `content/` (the CLI refuses to).
 */
import { createHash } from 'node:crypto';
import { toneMp3 } from './ffmpeg.js';
import type { TtsProvider } from './provider.js';
import { VOICE_SHORTLIST, type VoiceInfo } from './voices.js';

/** Fake speech length: ~55 ms per character, between 0.4 s and 15 s. */
export function fakeDurationMs(text: string): number {
  return Math.min(15000, Math.max(400, text.length * 55));
}

export function createFakeProvider(): TtsProvider & { calls: number } {
  const provider = {
    name: 'fake' as const,
    calls: 0,
    async synthesize(req: { text: string; voice: string }) {
      provider.calls++;
      const h = createHash('sha256').update(req.voice).digest()[0]!;
      return toneMp3({ ms: fakeDurationMs(req.text), frequency: 220 + (h % 6) * 60 });
    },
    async listVoices(languageCode: string): Promise<VoiceInfo[]> {
      if (languageCode !== 'en-US') return [];
      return VOICE_SHORTLIST.map((v) => ({
        name: v.name,
        languageCodes: ['en-US'],
        ssmlGender: v.gender,
        naturalSampleRateHertz: 24000,
      }));
    },
  };
  return provider;
}

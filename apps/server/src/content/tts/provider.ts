/** TTS provider interface: `google` (real REST API) or `fake` (local ffmpeg tone, for tests). */
import type { VoiceInfo, VoiceTier } from './voices.js';

export interface SynthesizeRequest {
  text: string;
  /** Full voice name, e.g. `en-US-Chirp3-HD-Aoede`. */
  voice: string;
  tier: VoiceTier;
  /** Only sent when the tier supports it (see `TIER_FEATURES`). */
  speakingRate?: number;
}

export interface TtsProvider {
  readonly name: 'google' | 'fake';
  /** MP3 bytes for one piece of text. */
  synthesize(req: SynthesizeRequest): Promise<Buffer>;
  /** Voices for a language code (`en-US`). */
  listVoices(languageCode: string): Promise<VoiceInfo[]>;
}

/** Error from the TTS API. The message never contains the API key. */
export class TtsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TtsApiError';
  }
}

/**
 * Google Cloud TTS voice tiers (plan 2.4: Chirp 3 HD → Neural2 → WaveNet, en-US only).
 *
 * Request features differ per tier. Chirp 3 HD voices do not accept SSML or `pitch`, and their
 * `speakingRate` support has changed over time, so we never send `speakingRate` to them (the
 * voice's natural pace is used; slow down in the player with 0.75× instead). We only ever send
 * plain `text`, never SSML, for every tier.
 */

export const VOICE_TIERS = ['chirp3-hd', 'neural2', 'wavenet'] as const;
export type VoiceTier = (typeof VOICE_TIERS)[number];

export interface TierFeatures {
  speakingRate: boolean;
  ssml: boolean;
}

export const TIER_FEATURES: Record<VoiceTier, TierFeatures> = {
  'chirp3-hd': { speakingRate: false, ssml: false },
  neural2: { speakingRate: true, ssml: true },
  wavenet: { speakingRate: true, ssml: true },
};

/** Tier of a voice from its name, or null for tiers we do not use (Standard, Studio, …). */
export function voiceTier(name: string): VoiceTier | null {
  if (/^en-US-Chirp3-HD-/i.test(name)) return 'chirp3-hd';
  if (/^en-US-Neural2-/i.test(name)) return 'neural2';
  if (/^en-US-Wavenet-/i.test(name)) return 'wavenet';
  return null;
}

export type VoiceGender = 'FEMALE' | 'MALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED';

export interface VoiceInfo {
  name: string;
  languageCodes: string[];
  ssmlGender: VoiceGender;
  naturalSampleRateHertz: number;
}

/**
 * Candidates to listen to with `content:tts:voices -- --sample`: 4 female + 4 male across the
 * three tiers, with two of each from Chirp 3 HD (the preferred tier).
 */
export const VOICE_SHORTLIST: readonly { name: string; gender: 'FEMALE' | 'MALE' }[] = [
  { name: 'en-US-Chirp3-HD-Aoede', gender: 'FEMALE' },
  { name: 'en-US-Chirp3-HD-Kore', gender: 'FEMALE' },
  { name: 'en-US-Neural2-F', gender: 'FEMALE' },
  { name: 'en-US-Wavenet-H', gender: 'FEMALE' },
  { name: 'en-US-Chirp3-HD-Charon', gender: 'MALE' },
  { name: 'en-US-Chirp3-HD-Puck', gender: 'MALE' },
  { name: 'en-US-Neural2-J', gender: 'MALE' },
  { name: 'en-US-Wavenet-D', gender: 'MALE' },
];

/** Same short text for every sample so the voices are easy to compare. */
export const SAMPLE_TEXT =
  'Excuse me, which platform does the ten fifteen train to Oxford leave from? ' +
  'Platform four. But I’m afraid it’s running about twenty minutes late.';

/** Voices we use (known tier), sorted by tier preference then name. */
export function usableVoices(voices: readonly VoiceInfo[]): VoiceInfo[] {
  return voices
    .filter((v) => v.languageCodes.includes('en-US') && voiceTier(v.name) !== null)
    .sort((a, b) => {
      const ta = VOICE_TIERS.indexOf(voiceTier(a.name)!);
      const tb = VOICE_TIERS.indexOf(voiceTier(b.name)!);
      return ta - tb || a.name.localeCompare(b.name);
    });
}

/** `content/tts.config.yaml`: which voice reads what (plan 2.4). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ttsConfigSchema, type TtsConfig } from '@daily-learning/shared/content';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { usableVoices, voiceTier, type VoiceInfo } from './voices.js';

export const TTS_CONFIG_FILE = 'tts.config.yaml';

export function loadTtsConfig(contentDir: string): TtsConfig {
  const path = join(contentDir, TTS_CONFIG_FILE);
  if (!existsSync(path)) throw new Error(`missing content/${TTS_CONFIG_FILE}`);
  const result = ttsConfigSchema.safeParse(parseYaml(readFileSync(path, 'utf8')));
  if (!result.success) {
    throw new Error(`content/${TTS_CONFIG_FILE}: ${z.prettifyError(result.error)}`);
  }
  for (const role of ['speakerA', 'speakerB', 'narrator', 'word'] as const) {
    if (!voiceTier(result.data[role])) {
      throw new Error(
        `content/${TTS_CONFIG_FILE}: ${role} "${result.data[role]}" is not a Chirp3-HD, Neural2 or WaveNet voice`,
      );
    }
  }
  return result.data;
}

/** Errors for configured voices that the API does not offer. */
export function checkVoices(names: Iterable<string>, available: readonly VoiceInfo[]): string[] {
  const known = new Set(available.map((v) => v.name));
  const errors: string[] = [];
  for (const name of new Set(names)) {
    if (known.has(name)) continue;
    const tier = voiceTier(name);
    const sameTier = usableVoices(available)
      .filter((v) => voiceTier(v.name) === tier)
      .slice(0, 8)
      .map((v) => v.name);
    errors.push(
      `voice "${name}" is not available${sameTier.length ? ` (same tier: ${sameTier.join(', ')}…)` : ''}. ` +
        `Run \`npm run content:tts:voices\` and fix content/${TTS_CONFIG_FILE}.`,
    );
  }
  return errors;
}

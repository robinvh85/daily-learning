// npm run content:tts:voices [-- --sample] [--voice <name>…] [--force] [--provider google|fake] [--out <dir>]
// List the en-US Chirp3-HD / Neural2 / WaveNet voices. --sample writes one short MP3 per shortlisted
// voice (or per --voice) into tmp/voice-samples/ (git-ignored) so you can listen and pick voices
// for content/tts.config.yaml.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnvFile, ROOT_DIR } from '../apps/server/src/config.js';
import {
  createProvider,
  maxChars,
  reportError,
  REPO_CONTENT_DIR,
} from '../apps/server/src/content/tts/cli.js';
import { loadTtsConfig } from '../apps/server/src/content/tts/config.js';
import {
  SAMPLE_TEXT,
  TIER_FEATURES,
  usableVoices,
  VOICE_SHORTLIST,
  voiceTier,
} from '../apps/server/src/content/tts/voices.js';

try {
  const { values } = parseArgs({
    options: {
      sample: { type: 'boolean', default: false },
      voice: { type: 'string', multiple: true },
      force: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'google' },
      out: { type: 'string' },
    },
  });
  loadEnvFile();
  const provider = createProvider(values.provider);
  const config = loadTtsConfig(REPO_CONTENT_DIR);
  const voices = usableVoices(await provider.listVoices('en-US'));
  const shortlist = new Set(VOICE_SHORTLIST.map((v) => v.name));
  const roles = new Map<string, string[]>();
  for (const role of ['speakerA', 'speakerB', 'narrator', 'word'] as const) {
    roles.set(config[role], [...(roles.get(config[role]) ?? []), role]);
  }

  console.log(
    `${voices.length} en-US voices (Chirp3-HD, Neural2, WaveNet). * = shortlist for --sample\n`,
  );
  for (const v of voices) {
    const mark = shortlist.has(v.name) ? '*' : ' ';
    const used = roles.get(v.name);
    console.log(
      `${mark} ${v.name.padEnd(28)} ${v.ssmlGender.padEnd(7)} ${voiceTier(v.name)!.padEnd(10)}` +
        (used ? ` ← ${used.join(', ')}` : ''),
    );
  }
  const known = new Set(voices.map((v) => v.name));
  for (const [name, r] of roles) {
    if (!known.has(name)) console.log(`\n! ${r.join(', ')}: "${name}" is not in the list above`);
  }

  if (values.sample) {
    const names = values.voice?.length ? values.voice : VOICE_SHORTLIST.map((v) => v.name);
    const outDir = resolve(values.out ?? join(ROOT_DIR, 'tmp/voice-samples'));
    mkdirSync(outDir, { recursive: true });
    const todo = names.filter((n) => values.force || !existsSync(join(outDir, `${n}.mp3`)));
    const chars = todo.length * SAMPLE_TEXT.length;
    const limit = maxChars();
    console.log(`\nSamples: ${todo.length} voice(s), ${chars} characters (limit ${limit}).`);
    if (chars > limit) throw new Error('over TTS_MAX_CHARS, nothing was sent');
    for (const name of todo) {
      const tier = voiceTier(name);
      if (!tier || !known.has(name)) {
        console.log(`  skip ${name}: not available`);
        continue;
      }
      const audio = await provider.synthesize({
        text: SAMPLE_TEXT,
        voice: name,
        tier,
        speakingRate: TIER_FEATURES[tier].speakingRate ? config.speakingRate : undefined,
      });
      writeFileSync(join(outDir, `${name}.mp3`), audio);
      console.log(`  ${join(outDir, `${name}.mp3`)}`);
    }
    console.log(
      '\nListen (macOS: open the folder or `afplay <file>`), then set speakerA, speakerB, narrator ' +
        'and word in content/tts.config.yaml.',
    );
  }
} catch (err) {
  reportError(err);
}

// npm run content:tts-words [-- --dry-run] [--force] [--provider google|fake] [--out <dir>] [lemma…]
// Pronunciation audio for every dictionary lemma that has no content/words/<lemma-slug>.mp3 yet.
// Shares the clip cache, TTS_MAX_CHARS limit and --dry-run with content:tts.
import { parseArgs } from 'node:util';
import { loadEnvFile } from '../packages/content/src/config.js';
import {
  createProvider,
  maxChars,
  reportError,
  resolveContentDir,
} from '../packages/content/src/content/tts/cli.js';
import { runWordTts } from '../packages/content/src/content/tts/run.js';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'google' },
      out: { type: 'string' },
    },
  });
  loadEnvFile();
  const log = (line: string) => console.log(line);
  const contentDir = resolveContentDir(values.out, values.provider, log);
  const dryRun = values['dry-run'];
  const provider = dryRun
    ? { name: values.provider as 'google' | 'fake', synthesize: never, listVoices: never }
    : createProvider(values.provider);
  const result = await runWordTts({
    contentDir,
    provider,
    lemmas: positionals.length > 0 ? positionals : undefined,
    dryRun,
    force: values.force,
    maxChars: maxChars(),
    log,
  });
  if (dryRun) console.log(`--dry-run: nothing was sent. Total characters: ${result.charsToSend}.`);
  else if (result.written.length > 0) console.log('Next: npm run content:build');
} catch (err) {
  reportError(err);
}

function never(): never {
  throw new Error('no API calls in --dry-run');
}

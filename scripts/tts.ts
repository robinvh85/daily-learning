// npm run content:tts -- <slug…|--all> [--dry-run] [--force] [--provider google|fake] [--out <dir>]
// Synthesize every segment (speaker A/B voices for listening, narrator for reading), join the clips
// with ffmpeg (gapMs of silence) and write audio.mp3 + timings.json next to lesson.yaml.
// --dry-run only prints the character count. Aborts before any API call above TTS_MAX_CHARS.
import { parseArgs } from 'node:util';
import { loadEnvFile } from '../packages/content/src/config.js';
import {
  createProvider,
  maxChars,
  reportError,
  resolveContentDir,
} from '../packages/content/src/content/tts/cli.js';
import { runLessonTts } from '../packages/content/src/content/tts/run.js';

const USAGE =
  'Usage: npm run content:tts -- <slug…|--all> [--dry-run] [--force] [--provider google|fake] [--out <dir>]';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'google' },
      out: { type: 'string' },
    },
  });
  if (values.all === positionals.length > 0)
    throw new Error(`pass lesson slugs or --all\n${USAGE}`);
  loadEnvFile();
  const log = (line: string) => console.log(line);
  const contentDir = resolveContentDir(values.out, values.provider, log);
  const dryRun = values['dry-run'];
  const provider = dryRun
    ? { name: values.provider as 'google' | 'fake', synthesize: never, listVoices: never }
    : createProvider(values.provider);
  const result = await runLessonTts({
    contentDir,
    provider,
    slugs: values.all ? 'all' : positionals,
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

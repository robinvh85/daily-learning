// `npm run emulators`: Auth + Firestore emulators for local development (demo project, no real
// Firebase project needed). Data is kept in tmp/emulator-data between runs. Needs Java 21+.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const DATA_DIR = 'tmp/emulator-data';
const args = [
  'firebase',
  'emulators:start',
  '--only',
  'auth,firestore',
  '--project',
  'demo-daily-learning',
  '--export-on-exit',
  DATA_DIR,
];
// --import fails on a directory that was never exported, so only pass it after the first run.
if (existsSync(`${DATA_DIR}/firebase-export-metadata.json`)) args.push('--import', DATA_DIR);

const child = spawn('npx', args, { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));

#!/usr/bin/env node
// Pre-commit guard (plan section 2.3):
//  - block staged media files larger than 5 MB
//  - block staged *.json files that look like a service account key ("private_key")
// Reads the staged (index) version of each file, not the working copy.
import { execFileSync } from 'node:child_process';

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MEDIA_EXT = /\.(mp3|m4a|wav|ogg|opus|webm|mp4|mov|webp|png|jpe?g|gif|avif)$/i;

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, { encoding, maxBuffer: 256 * 1024 * 1024 });
}

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  .split('\0')
  .filter(Boolean);

const errors = [];

for (const file of staged) {
  if (MEDIA_EXT.test(file)) {
    const size = Number(git(['cat-file', '-s', `:${file}`]).trim());
    if (size > MAX_MEDIA_BYTES) {
      const mb = (size / 1024 / 1024).toFixed(1);
      errors.push(`${file}: ${mb} MB (media files must be <= 5 MB, see plan 2.3)`);
    }
  }
  if (/\.json$/i.test(file)) {
    const content = git(['show', `:${file}`]);
    if (content.includes('private_key')) {
      errors.push(`${file}: contains "private_key" (looks like a secret key, never commit it)`);
    }
  }
}

if (errors.length > 0) {
  console.error('Commit blocked by scripts/check-staged.mjs:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

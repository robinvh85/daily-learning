// npm run content:check-dict [<slug>]
// List the words of a lesson (or of every lesson) that are missing from content/dictionary/,
// and the multi-sense words that have no `senses` choice in lesson.yaml.
import { join } from 'node:path';
import { ROOT_DIR } from '../packages/content/src/config.js';
import { formatIssues, loadContent } from '../packages/content/src/content/load.js';

const slug = process.argv[2];
const bundle = loadContent(join(ROOT_DIR, 'content'));
const lessons = slug ? bundle.lessons.filter((l) => l.slug === slug) : bundle.lessons;

if (slug && lessons.length === 0) {
  const invalid = bundle.issues.filter((i) => i.file.includes(`/${slug}/`));
  if (invalid.length > 0) console.error(formatIssues(invalid));
  console.error(
    `Lesson "${slug}" not found or invalid. Known: ${bundle.lessons.map((l) => l.slug).join(', ') || '(none)'}`,
  );
  process.exit(1);
}

let missingTotal = 0;
for (const l of lessons) {
  missingTotal += l.missing.length;
  console.log(`${l.slug} (${l.file})`);
  console.log(`  missing from dictionary (${l.missing.length}): ${l.missing.join(', ') || '-'}`);
  console.log(
    `  several senses, no choice (${l.ambiguous.length}): ${l.ambiguous.join(', ') || '-'}`,
  );
  const other = bundle.issues.filter(
    (i) => i.file === l.file && !i.message.includes('is not in the dictionary;'),
  );
  if (other.length > 0) console.log(formatIssues(other).replace(/^/gm, '  '));
}
const dictErrors = bundle.issues.filter(
  (i) => i.file.startsWith('dictionary') && i.level === 'error',
);
if (dictErrors.length > 0) console.log(`\nDictionary errors:\n${formatIssues(dictErrors)}`);
if (missingTotal > 0 || dictErrors.length > 0) process.exitCode = 1;

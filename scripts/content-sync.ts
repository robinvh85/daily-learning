// npm run content:sync [-- --dry-run]
// Validate content/ (lessons, dictionary, daily plan) and upsert it into DB_PATH in one transaction.
// --dry-run only validates and exits 1 on any error (used by CI).
import { join } from 'node:path';
import { loadEnvFile, resolveDbPath, ROOT_DIR } from '../apps/server/src/config.js';
import { formatIssues } from '../apps/server/src/content/load.js';
import { syncContent } from '../apps/server/src/content/sync.js';
import { openAndMigrate } from '../apps/server/src/db/client.js';

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length > 0) {
  console.error(
    `Unknown argument(s): ${unknown.join(' ')}\nUsage: npm run content:sync [-- --dry-run]`,
  );
  process.exit(2);
}
const dryRun = args.includes('--dry-run');
const contentDir = join(ROOT_DIR, 'content');

loadEnvFile();
const dbPath = resolveDbPath();
const db = dryRun ? undefined : openAndMigrate(dbPath);
try {
  const result = syncContent({ contentDir, db, dryRun });
  if (result.issues.length > 0) console.log(formatIssues(result.issues));
  const errors = result.issues.filter((i) => i.level === 'error').length;
  const warnings = result.issues.length - errors;
  if (!result.ok) {
    console.error(
      `\ncontent:sync failed: ${errors} error(s), ${warnings} warning(s). Nothing was written.`,
    );
    process.exitCode = 1;
  } else if (dryRun) {
    console.log(`content:sync --dry-run: OK (${warnings} warning(s)). Nothing was written.`);
  } else {
    const c = result.counts!;
    console.log(
      `content:sync: OK → ${dbPath}\n` +
        `  words ${c.words}, senses ${c.senses}, forms ${c.forms}\n` +
        `  lessons ${c.lessons}, segments ${c.segments}, tokens ${c.tokens}, focus words ${c.focusWords}\n` +
        `  questions ${c.questions}, dictation ${c.dictation}, plan days ${c.planDays}\n` +
        `  ${warnings} warning(s)`,
    );
  }
} finally {
  db?.$client.close();
}

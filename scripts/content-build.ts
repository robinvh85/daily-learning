/**
 * `npm run content:build [-- --check] [-- --out <dir>]`
 *
 * Validate `content/` and write the static files the web app reads: `<out>/data/*.json` plus the
 * lesson / word audio and covers (default `<out>` = `apps/web/public/content`, served as
 * `/content/` by Vite in dev and copied into `apps/web/dist` by `vite build`).
 *
 * `--check`: only validate (CI), nothing is written.
 */
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT_DIR } from '../packages/content/src/config.js';
import { buildContentData, writeContentOutput } from '../packages/content/src/content/build.js';
import { formatIssues, hasErrors, loadContent } from '../packages/content/src/content/load.js';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    out: { type: 'string', default: join(ROOT_DIR, 'apps/web/public/content') },
  },
});

const contentDir = join(ROOT_DIR, 'content');
const bundle = loadContent(contentDir);
if (bundle.issues.length > 0) console.log(formatIssues(bundle.issues));
const errors = bundle.issues.filter((i) => i.level === 'error').length;
const warnings = bundle.issues.length - errors;
if (hasErrors(bundle.issues)) {
  console.error(
    `\ncontent:build failed: ${errors} error(s), ${warnings} warning(s). Nothing was written.`,
  );
  process.exit(1);
}

const built = buildContentData(bundle);
const counts =
  `${built.catalog.lessons.length} lessons, ${built.catalog.words.length} words, ` +
  `${built.catalog.grammar.length} grammar points, ${built.catalog.plan.length} plan days, ` +
  `${warnings} warning(s)`;
if (values.check) {
  console.log(`content:build --check: OK (${counts}). Nothing was written.`);
} else {
  const out = resolve(values.out);
  const r = writeContentOutput(built, contentDir, out);
  console.log(
    `content:build: OK → ${out} (version ${built.catalog.version})\n` +
      `  ${counts}\n` +
      `  ${r.dataFiles} data files, media ${r.mediaCopied} copied / ${r.mediaKept} unchanged, ${r.removed} removed`,
  );
}

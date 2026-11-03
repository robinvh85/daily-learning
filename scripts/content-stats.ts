// npm run content:stats: dictionary size, share of reviewed entries, Oxford 3000 coverage, lessons.
import { join } from 'node:path';
import { CEFR_LEVELS } from '@daily-learning/shared';
import { ROOT_DIR } from '../packages/content/src/config.js';
import { loadContent } from '../packages/content/src/content/load.js';

const bundle = loadContent(join(ROOT_DIR, 'content'));
const entries = bundle.entries.map((e) => e.entry);
const pct = (n: number, total: number) =>
  total === 0 ? '0%' : `${((100 * n) / total).toFixed(1)}%`;

const reviewed = entries.filter((e) => e.status === 'reviewed').length;
const phrases = entries.filter((e) => e.is_phrase).length;
const oxford = entries.filter((e) => e.oxford3000).length;
const senses = entries.reduce((n, e) => n + e.senses.length, 0);
const byCefr = CEFR_LEVELS.map((c) => `${c} ${entries.filter((e) => e.cefr === c).length}`).join(
  ', ',
);

const used = new Set(bundle.lessons.flatMap((l) => l.tokens.flat().map((t) => t.lemma)));
const tokens = bundle.lessons.reduce((n, l) => n + l.tokens.flat().length, 0);
const reading = bundle.lessons.filter((l) => l.lesson.kind === 'reading').length;
const errors = bundle.issues.filter((i) => i.level === 'error').length;

console.log(`Dictionary
  entries:     ${entries.length} (${phrases} phrases, ${senses} senses)
  reviewed:    ${reviewed}/${entries.length} (${pct(reviewed, entries.length)}); draft ${entries.length - reviewed}
  Oxford 3000: ${oxford} entries flagged (${pct(oxford, 3000)} of the list)
  CEFR:        ${byCefr}
  used:        ${used.size} entries appear in lessons, ${entries.length - used.size} unused
Lessons
  total:       ${bundle.lessons.length} (${reading} reading, ${bundle.lessons.length - reading} listening)
  tokens:      ${tokens}
  plan days:   ${bundle.dailyPlan?.days.length ?? 0}
Validation:    ${errors === 0 ? 'OK' : `${errors} error(s), run npm run content:build -- --check`}`);

// npm run content:check-grammar [<slug>] [-- --all]
// Report on grammar points (content/grammar/*.yaml): plan days, marked sentences per source,
// words of the example sentences missing from the dictionary, and lesson sentences that match
// the point's `detect` pattern but are not marked yet (in the day's lessons, or every lesson
// with --all). Exit code 1 when there are errors.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findGrammarMatch, type GrammarPointFile } from '@daily-learning/shared/content';
import { ROOT_DIR } from '../packages/content/src/config.js';
import { collectGrammarMarks, planDaysFor } from '../packages/content/src/content/grammar.js';
import { formatIssues, loadContent } from '../packages/content/src/content/load.js';
import { tokenizeLesson } from '../packages/content/src/content/tokenizer.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean', default: false } },
});
const slug = positionals[0];
const bundle = loadContent(join(ROOT_DIR, 'content'));
const points = slug ? bundle.grammar.filter((g) => g.slug === slug) : bundle.grammar;

if (slug && points.length === 0) {
  const invalid = bundle.issues.filter((i) => i.file === `grammar/${slug}.yaml`);
  if (invalid.length > 0) console.error(formatIssues(invalid));
  console.error(
    `Grammar point "${slug}" not found or invalid. Known: ${bundle.grammar.map((g) => g.slug).join(', ') || '(none)'}`,
  );
  process.exit(1);
}

/** English sentences written in the grammar file (not the lesson sentences). */
function exampleSentences(point: GrammarPointFile): string[] {
  const out = point.form.map((f) => f.example);
  out.push(...point.common_mistakes.map((m) => m.right));
  for (const e of point.exercises) {
    if (e.type === 'order') out.push(e.answer);
    if (e.type === 'find_error') {
      const r = findGrammarMatch(e.sentence, e.wrong);
      if (r) out.push(e.sentence.slice(0, r[0]![0]) + e.right + e.sentence.slice(r[0]![1]));
    }
    if (e.type === 'choice') out.push(e.prompt.replace('___', e.options[e.correct]!));
    if (e.type === 'gap') out.push(e.prompt.replace('___', e.answer).replace(/\s*\([^)]*\)/, ''));
  }
  return out;
}

const marks = collectGrammarMarks(bundle.lessons);
let errors = 0;
for (const g of points) {
  const days = planDaysFor(bundle.dailyPlan, g.slug);
  const own = marks.filter((m) => m.point === g.slug);
  const dayLessons = new Set(days.flatMap((d) => d.lessons));
  const pins = new Set(g.point.discover.pinned);
  const fromDay = own.filter((m) => dayLessons.has(m.lesson.slug)).length;
  const pinned = own.filter((m) => pins.has(`${m.lesson.slug}#${m.segmentKey}`)).length;

  console.log(`${g.slug} — ${g.point.title} (${g.point.status})`);
  console.log(`  plan days: ${days.map((d) => d.day).join(', ') || '-'}`);
  console.log(
    `  marked sentences: ${own.length} (day ${fromDay}, pinned ${pinned}, other ${own.length - fromDay - pinned})`,
  );
  console.log(`  exercises: ${g.point.exercises.length}`);

  const tokens = tokenizeLesson(exampleSentences(g.point), { lookup: bundle.lookup });
  const missing = [...new Set(tokens.missing.map((m) => m.surface.toLowerCase()))];
  console.log(`  example words missing from dictionary: ${missing.join(', ') || '-'}`);

  if (g.point.detect) {
    const re = new RegExp(g.point.detect, 'iu');
    const scope = values.all
      ? bundle.lessons
      : bundle.lessons.filter((l) => dayLessons.has(l.slug));
    const suggestions: string[] = [];
    for (const l of scope) {
      for (const s of l.lesson.segments) {
        const marked = own.some((m) => m.lesson.slug === l.slug && m.segmentKey === s.id);
        if (!marked && re.test(s.text_en)) suggestions.push(`${l.slug}#${s.id}: ${s.text_en}`);
      }
    }
    const where = values.all ? 'all lessons' : "the day's lessons";
    console.log(`  not marked yet, matching detect (${where}): ${suggestions.length || '-'}`);
    for (const s of suggestions) console.log(`    ${s}`);
  }

  const related = bundle.issues.filter(
    (i) =>
      i.file === g.file ||
      (i.file === 'daily-plan.yaml' && i.message.includes(g.slug)) ||
      i.message.includes(`grammar point "${g.slug}"`),
  );
  errors += related.filter((i) => i.level === 'error').length;
  if (related.length > 0) console.log(formatIssues(related).replace(/^/gm, '  '));
  console.log('');
}

const markErrors = bundle.issues.filter(
  (i) => i.level === 'error' && /grammar/.test(i.message) && !i.file.startsWith('grammar/'),
);
if (!slug && markErrors.length > 0) {
  console.log(`Lesson / plan grammar errors:\n${formatIssues(markErrors)}`);
  errors += markErrors.length;
}
if (errors > 0) process.exitCode = 1;

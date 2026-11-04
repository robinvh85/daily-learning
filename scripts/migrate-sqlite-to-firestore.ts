// npm run migrate:sqlite -- (--emulator | --project <id>) (--uid <uid> | --email <email>)
//                           [--db data/app.db] [--sqlite-user <id>] [--dry-run]
//
// Copy one learner's progress from the old SQLite database (before the move to Firebase) into
// Firestore `users/{uid}/…`. Content ids of SQLite are turned into natural keys (slug, lemma,
// sense key, question index). Every document id is fixed (`sqlite-<id>` for logs), so running it
// again overwrites the same documents instead of adding copies. The SQLite file is only read.
//
// The target account must exist (sign in once with Google on the site); it is given the `learner`
// claim like `npm run user:grant`.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ROOT_DIR } from '../packages/content/src/config.js';
import { initAdmin } from './lib/firebase-admin.js';

const { values } = parseArgs({
  options: {
    emulator: { type: 'boolean', default: false },
    project: { type: 'string' },
    uid: { type: 'string' },
    email: { type: 'string' },
    db: { type: 'string', default: 'data/app.db' },
    'sqlite-user': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if ((!values.emulator && !values.project) || (!values.uid && !values.email)) {
  console.error(
    'Usage: npm run migrate:sqlite -- (--emulator | --project <id>) (--uid <uid> | --email <email>)\n' +
      '                              [--db data/app.db] [--sqlite-user <id>] [--dry-run]',
  );
  process.exit(2);
}
const dbPath = resolve(ROOT_DIR, values.db);
if (!existsSync(dbPath)) {
  console.error(`No SQLite database at ${dbPath}`);
  process.exit(1);
}

/** Same as `wordDocId()` in apps/web/src/backend/userStore.ts. */
const wordDocId = (lemma: string) => encodeURIComponent(lemma);
const ts = (ms: number | null) => (ms === null ? null : Timestamp.fromMillis(ms));

const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
const all = <T>(sql: string, ...params: unknown[]) => sqlite.prepare(sql).all(...params) as T[];

// --- Which SQLite user ----------------------------------------------------
interface UserRow {
  id: number;
  email: string | null;
  display_name: string;
  level: string;
  daily_goal_min: number;
  created_at: number;
}
const users = all<UserRow>('select * from users order by id');
const sqliteUserId = values['sqlite-user']
  ? Number(values['sqlite-user'])
  : users.length === 1
    ? users[0]!.id
    : users.find((u) => u.email === null)?.id;
const user = users.find((u) => u.id === sqliteUserId);
if (!user) {
  console.error(
    `Pick the SQLite user with --sqlite-user <id>: ${users.map((u) => `${u.id} (${u.email ?? 'local'})`).join(', ')}`,
  );
  process.exit(1);
}

// --- Content ids → natural keys --------------------------------------------
const slugOf = new Map(
  all<{ id: number; slug: string }>('select id, slug from lessons').map((r) => [r.id, r.slug]),
);
const lemmaOf = new Map(
  all<{ id: number; lemma: string }>('select id, lemma from words').map((r) => [r.id, r.lemma]),
);
const senseKeyOf = new Map(
  all<{ id: number; key: string }>('select id, key from word_senses').map((r) => [r.id, r.key]),
);
const questionOf = new Map(
  all<{ id: number; lesson_id: number; idx: number }>(
    'select id, lesson_id, idx from questions',
  ).map((r) => [r.id, { slug: slugOf.get(r.lesson_id)!, idx: r.idx }]),
);
const dictationOf = new Map(
  all<{ id: number; lesson_id: number; idx: number }>(
    'select id, lesson_id, idx from dictation_items',
  ).map((r) => [r.id, { slug: slugOf.get(r.lesson_id)!, idx: r.idx }]),
);

// --- Documents -------------------------------------------------------------
type Doc = { path: string; data: Record<string, unknown> };
const docs: Doc[] = [];
const skipped: string[] = [];
const uidPlaceholder = '{uid}';
const at = (p: string) => `users/${uidPlaceholder}${p}`;

docs.push({
  path: at(''),
  data: {
    displayName: user.display_name,
    level: user.level,
    dailyGoalMin: user.daily_goal_min,
    createdAt: ts(user.created_at),
  },
});

for (const r of all<{
  lesson_id: number;
  status: string;
  step: number;
  score: number | null;
  completed_at: number | null;
  updated_at: number;
}>('select * from lesson_progress where user_id = ?', user.id)) {
  const slug = slugOf.get(r.lesson_id);
  if (!slug) {
    skipped.push(`lesson_progress lesson ${r.lesson_id}`);
    continue;
  }
  docs.push({
    path: at(`/lessonProgress/${slug}`),
    data: {
      status: r.status,
      step: r.step,
      score: r.score,
      completedAt: ts(r.completed_at),
      updatedAt: ts(r.updated_at),
    },
  });
}

for (const r of all<{
  word_id: number;
  sense_id: number | null;
  source_lesson_id: number | null;
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
  created_at: number;
}>('select * from user_words where user_id = ?', user.id)) {
  const lemma = lemmaOf.get(r.word_id)!;
  docs.push({
    path: at(`/words/${wordDocId(lemma)}`),
    data: {
      lemma,
      sense: r.sense_id === null ? null : (senseKeyOf.get(r.sense_id) ?? null),
      sourceLesson: r.source_lesson_id === null ? null : (slugOf.get(r.source_lesson_id) ?? null),
      due: ts(r.due),
      stability: r.stability,
      difficulty: r.difficulty,
      scheduledDays: r.scheduled_days,
      learningSteps: r.learning_steps,
      reps: r.reps,
      lapses: r.lapses,
      state: r.state,
      lastReview: ts(r.last_review),
      createdAt: ts(r.created_at),
    },
  });
}

for (const r of all<{
  date: string;
  seconds_studied: number;
  lessons_done: number;
  reviews_done: number;
}>('select * from daily_activity where user_id = ?', user.id)) {
  docs.push({
    path: at(`/dailyActivity/${r.date}`),
    data: {
      date: r.date,
      secondsStudied: r.seconds_studied,
      lessonsDone: r.lessons_done,
      reviewsDone: r.reviews_done,
    },
  });
}

for (const r of all<{
  id: number;
  question_id: number | null;
  dictation_item_id: number | null;
  value: string;
  correct: number;
  answered_at: number;
}>('select * from answers where user_id = ?', user.id)) {
  const q = r.question_id === null ? null : questionOf.get(r.question_id);
  const d = r.dictation_item_id === null ? null : dictationOf.get(r.dictation_item_id);
  const target = q ?? d;
  if (!target) {
    skipped.push(`answer ${r.id}`);
    continue;
  }
  docs.push({
    path: at(`/answers/sqlite-${r.id}`),
    data: {
      lesson: target.slug,
      question: q ? q.idx : null,
      dictation: d ? d.idx : null,
      value: r.value,
      correct: r.correct === 1,
      answeredAt: ts(r.answered_at),
    },
  });
}

for (const r of all<{
  id: number;
  word_id: number;
  rating: number;
  reviewed_at: number;
  elapsed_days: number;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  due: number | null;
}>('select * from review_logs where user_id = ?', user.id)) {
  docs.push({
    path: at(`/reviewLogs/sqlite-${r.id}`),
    data: {
      lemma: lemmaOf.get(r.word_id)!,
      rating: r.rating,
      reviewedAt: ts(r.reviewed_at),
      elapsedDays: r.elapsed_days,
      state: r.state,
      stability: r.stability,
      difficulty: r.difficulty,
      scheduledDays: r.scheduled_days,
      due: ts(r.due),
    },
  });
}
sqlite.close();

// --- Summary / write ---------------------------------------------------------
const byCollection = new Map<string, number>();
for (const d of docs) {
  const parts = d.path.split('/');
  const name = parts.length === 2 ? 'profile' : parts[2]!;
  byCollection.set(name, (byCollection.get(name) ?? 0) + 1);
}
const summary = [...byCollection].map(([k, n]) => `${k} ${n}`).join(', ');
console.log(
  `SQLite user ${user.id} (${user.email ?? 'local'}, "${user.display_name}") in ${dbPath}`,
);
console.log(`Documents: ${summary}`);
if (skipped.length)
  console.log(`Skipped (content no longer in the database): ${skipped.join(', ')}`);

if (values['dry-run']) {
  console.log('--dry-run: nothing was written.');
  process.exit(0);
}

const { app, label } = initAdmin({ emulator: values.emulator, project: values.project });
const auth = getAuth(app);
const account = await (
  values.uid ? auth.getUser(values.uid) : auth.getUserByEmail(values.email!)
).catch((err: { code?: string }) => {
  if (err.code !== 'auth/user-not-found') throw err;
  console.error(
    `No account ${values.uid ?? values.email} in ${label}: sign in once with Google on the site first.`,
  );
  process.exit(1);
});
const uid = account.uid;
if (account.customClaims?.learner !== true) {
  // Same claim as `user:grant`: without it firestore.rules keep the account out.
  await auth.setCustomUserClaims(uid, { ...account.customClaims, learner: true });
  console.log(`Gave ${account.email ?? uid} the learner claim (reload the site to use it).`);
}
const firestore = getFirestore(app);
const writer = firestore.bulkWriter();
let failed = 0;
writer.onWriteError((err) => {
  failed++;
  console.error(`write failed: ${err.documentRef.path}: ${err.message}`);
  return false;
});
for (const d of docs) writer.set(firestore.doc(d.path.replace(uidPlaceholder, uid)), d.data);
await writer.close();

// Check: every collection now has at least what was copied.
const counts: string[] = [];
for (const [name, n] of byCollection) {
  if (name === 'profile') continue;
  const snap = await firestore.collection(`users/${uid}/${name}`).count().get();
  counts.push(`${name} ${snap.data().count}/${n}`);
}
console.log(`Wrote ${docs.length - failed} document(s) to ${label}, uid ${uid}`);
console.log(`In Firestore now (found/copied): ${counts.join(', ')}`);
if (failed) process.exitCode = 1;

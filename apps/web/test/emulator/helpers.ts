/**
 * Helpers for the tests that run against the Firebase emulators (`npm run test:emulator`):
 * real Auth + Firestore with `firestore.rules`, and the real `content/` built in memory.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildContentData } from '@daily-learning/content/build';
import { hasErrors, loadContent } from '@daily-learning/content/load';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import { ContentStore, type ContentSource } from '../../src/backend/content';
import { DEMO_PROJECT_ID } from '../../src/backend/firebase';
import type { BackendContext } from '../../src/backend/handlers';
import { UserStore } from '../../src/backend/userStore';

const CONTENT_DIR = fileURLToPath(new URL('../../../../content', import.meta.url));

let built: ReturnType<typeof buildContentData> | null = null;

/** The repository's content, built once per test file. */
export function repoContent() {
  if (!built) {
    const bundle = loadContent(CONTENT_DIR);
    if (hasErrors(bundle.issues)) throw new Error('content/ has errors: run npm run content:build');
    built = buildContentData(bundle);
  }
  return built;
}

export function memoryContentSource(): ContentSource {
  const b = repoContent();
  const lessons = new Map(b.lessons.map((l) => [l.slug, l]));
  return {
    catalog: async () => b.catalog,
    lesson: async (slug) => lessons.get(slug) ?? null,
    examples: async () => b.examples,
    grammar: async (slug) => b.grammar.find((g) => g.slug === slug) ?? null,
  };
}

export interface Learner {
  app: FirebaseApp;
  db: Firestore;
  uid: string;
  store: UserStore;
  ctx: BackendContext;
  /** Move the clock used by the handlers. */
  setNow(d: Date | string): void;
  close(): Promise<void>;
}

/** Set custom claims on an Auth emulator account (what `user:grant` does with the Admin SDK). */
export async function setClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${DEMO_PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    },
  );
  if (!res.ok) throw new Error(`accounts:update: HTTP ${res.status} ${await res.text()}`);
}

/**
 * A fresh signed-in user with an empty Firestore tree. `learner: false` leaves out the custom
 * claim that firestore.rules require (an account not given access by `user:grant`).
 */
export async function newLearner(
  now: Date | string = '2026-10-24T02:00:00Z',
  opts: { learner?: boolean } = {},
): Promise<Learner> {
  const app = initializeApp(
    { apiKey: 'demo-api-key', projectId: DEMO_PROJECT_ID },
    `test-${randomUUID()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await createUserWithEmailAndPassword(
    auth,
    `learner-${randomUUID()}@example.com`,
    'secret-password',
  );
  if (opts.learner !== false) {
    await setClaims(cred.user.uid, { learner: true });
    await cred.user.getIdToken(true);
  }
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  const store = new UserStore(db, cred.user.uid);
  if (opts.learner !== false) await store.ready;
  let t = new Date(now);
  return {
    app,
    db,
    uid: cred.user.uid,
    store,
    ctx: { content: new ContentStore(memoryContentSource()), store, now: () => t },
    setNow(d) {
      t = new Date(d);
    },
    async close() {
      store.dispose();
      await terminate(db);
      await deleteApp(app);
    },
  };
}

/** Same user, new connection and store: what a page reload sees. */
export async function reopen(l: Learner): Promise<UserStore> {
  const store = new UserStore(l.db, l.uid);
  await store.ready;
  return store;
}

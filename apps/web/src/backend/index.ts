/**
 * The in-browser backend: Firebase Auth for login, Firestore for the learner's data, the static
 * content files for lessons and the dictionary. `api/client.ts` loads this module lazily.
 */
import type { LoginBody, MeResponse } from '@daily-learning/shared/api';
import { FirebaseError } from 'firebase/app';
import { signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { ApiRequestError } from '../api/errors';
import type { ApiInit } from '../api/client';
import { ContentStore, httpContentSource } from './content';
import { getFirebase } from './firebase';
import type { BackendContext } from './handlers';
import { route, type RouterDeps } from './router';
import { UserStore } from './userStore';

const content = new ContentStore(httpContentSource);
let store: UserStore | null = null;

function meOf(user: User | null): MeResponse {
  return { authMode: 'password', user: user ? { id: user.uid, email: user.email } : null };
}

/** The store of `user`, (re)created when the signed-in user changes. */
async function storeFor(user: User): Promise<UserStore> {
  const { db } = await getFirebase();
  // No await between the check and the assignment: concurrent calls share one store.
  if (store?.uid !== user.uid) {
    store?.dispose();
    store = new UserStore(db, user.uid);
  }
  const s = store;
  try {
    await s.ready;
  } catch (err) {
    if (store === s) store = null;
    if (err instanceof FirebaseError && err.code === 'permission-denied') {
      // Signed in, but without the `learner` claim (account not made by `npm run user:create`).
      throw new ApiRequestError(403, 'forbidden', 'Tài khoản này chưa được cấp quyền dùng app.');
    }
    throw new ApiRequestError(503, 'firestore_error', `Không đọc được dữ liệu: ${String(err)}`);
  }
  await s.ensureProfile(user.displayName);
  return s;
}

const LOGIN_FAILED = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/user-disabled',
]);

const deps: RouterDeps = {
  async me() {
    const { auth } = await getFirebase();
    await auth.authStateReady();
    return meOf(auth.currentUser);
  },
  async login(body: LoginBody) {
    const { auth } = await getFirebase();
    try {
      const cred = await signInWithEmailAndPassword(auth, body.email.trim(), body.password);
      return meOf(cred.user);
    } catch (err) {
      if (err instanceof FirebaseError && LOGIN_FAILED.has(err.code)) {
        throw new ApiRequestError(401, 'unauthorized', 'Invalid email or password');
      }
      if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
        throw new ApiRequestError(429, 'too_many_requests', 'Thử lại sau ít phút');
      }
      throw err;
    }
  },
  async logout() {
    const { auth } = await getFirebase();
    store?.dispose();
    store = null;
    await signOut(auth);
  },
  async context(): Promise<BackendContext> {
    const { auth } = await getFirebase();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new ApiRequestError(401, 'unauthorized', 'Login required');
    return { content, store: await storeFor(user), now: () => new Date() };
  },
};

export function handleApi(path: string, init: ApiInit): Promise<unknown> {
  return route(path, init, deps);
}

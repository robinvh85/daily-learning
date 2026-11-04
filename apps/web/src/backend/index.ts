/**
 * The in-browser backend: Firebase Auth for login, Firestore for the learner's data, the static
 * content files for lessons and the dictionary. `api/client.ts` loads this module lazily.
 */
import type { MeResponse } from '@daily-learning/shared/api';
import { FirebaseError } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth';
import { ApiRequestError } from '../api/errors';
import type { ApiInit } from '../api/client';
import { ContentStore, httpContentSource } from './content';
import { getFirebase } from './firebase';
import type { BackendContext } from './handlers';
import { route, type RouterDeps } from './router';
import { UserStore } from './userStore';

const content = new ContentStore(httpContentSource);
let store: UserStore | null = null;

const FORBIDDEN = 'Tài khoản này chưa được cấp quyền dùng app.';

function meOf(user: User | null, forbidden = false): MeResponse {
  return {
    authMode: 'password',
    user: user ? { id: user.uid, email: user.email } : null,
    ...(forbidden ? { forbidden: true } : {}),
  };
}

const isDenied = (err: unknown) => err instanceof FirebaseError && err.code === 'permission-denied';

/** Open the store of `user` and wait for its data, or return why it failed. */
async function openStore(user: User): Promise<{ store: UserStore } | { error: unknown }> {
  const { db } = await getFirebase();
  // No await between the check and the assignment: concurrent calls share one store.
  if (store?.uid !== user.uid) {
    store?.dispose();
    store = new UserStore(db, user.uid);
  }
  const s = store;
  try {
    await s.ready;
    return { store: s };
  } catch (error) {
    if (store === s) {
      s.dispose();
      store = null;
    }
    return { error };
  }
}

/** The store of `user`, (re)created when the signed-in user changes. */
async function storeFor(user: User): Promise<UserStore> {
  let r = await openStore(user);
  if ('error' in r && isDenied(r.error)) {
    // The `learner` claim may have been granted after this ID token was issued: refresh it once.
    await user.getIdToken(true);
    r = await openStore(user);
  }
  if ('error' in r) {
    if (isDenied(r.error)) {
      // Signed in with Google, but not given access (`npm run user:grant`).
      throw new ApiRequestError(403, 'forbidden', FORBIDDEN);
    }
    throw new ApiRequestError(503, 'firestore_error', `Không đọc được dữ liệu: ${String(r.error)}`);
  }
  await r.store.ensureProfile(user.displayName);
  return r.store;
}

/** `me` for a signed-in user, with `forbidden` when the account has no access yet. */
async function meWithAccess(user: User): Promise<MeResponse> {
  try {
    await storeFor(user);
    return meOf(user);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 403) return meOf(user, true);
    throw err;
  }
}

/** The popup was closed or replaced by another one: not an error worth showing. */
const LOGIN_CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

const deps: RouterDeps = {
  async me() {
    const { auth } = await getFirebase();
    await auth.authStateReady();
    return auth.currentUser ? meWithAccess(auth.currentUser) : meOf(null);
  },
  async login() {
    const { auth } = await getFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let user: User;
    try {
      user = (await signInWithPopup(auth, provider)).user;
    } catch (err) {
      if (err instanceof FirebaseError && LOGIN_CANCELLED.has(err.code)) {
        throw new ApiRequestError(400, 'cancelled', 'Đã đóng cửa sổ đăng nhập');
      }
      if (err instanceof FirebaseError && err.code === 'auth/popup-blocked') {
        throw new ApiRequestError(
          400,
          'popup_blocked',
          'Trình duyệt đã chặn cửa sổ đăng nhập Google. Cho phép popup cho trang này rồi thử lại.',
        );
      }
      if (err instanceof FirebaseError && err.code === 'auth/user-disabled') {
        throw new ApiRequestError(403, 'user_disabled', 'Tài khoản này đã bị khoá.');
      }
      throw err;
    }
    return meWithAccess(user);
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

/**
 * Firebase app, Auth and Firestore for the browser.
 *
 * Config:
 * - dev (`vite`) and the `e2e` build: a demo project (`demo-daily-learning`) on the local
 *   emulators (`npm run emulators`), no real project or network needed;
 * - production on Firebase Hosting: `/__/firebase/init.json`, served by Hosting for the project
 *   the site belongs to, so nothing project-specific is committed or baked into the build.
 */
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export const DEMO_PROJECT_ID = 'demo-daily-learning';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

/** Ports in firebase.json (`emulators`). */
const EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8180;

export function usesEmulators(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'e2e';
}

async function loadConfig(): Promise<FirebaseOptions> {
  if (usesEmulators()) {
    return { apiKey: 'demo-api-key', authDomain: '127.0.0.1', projectId: DEMO_PROJECT_ID };
  }
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error(`Không đọc được cấu hình Firebase (HTTP ${res.status})`);
  return (await res.json()) as FirebaseOptions;
}

let services: Promise<FirebaseServices> | null = null;

export function getFirebase(): Promise<FirebaseServices> {
  services ??= (async () => {
    const app = initializeApp(await loadConfig());
    const auth = getAuth(app);
    // Offline cache in IndexedDB: a reload reads saved words and progress from the cache, and a
    // heartbeat written while the tab closes is sent on the next visit.
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (usesEmulators()) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
        disableWarnings: true,
      });
      connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    }
    return { app, auth, db };
  })();
  return services;
}

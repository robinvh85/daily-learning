/**
 * Firebase Admin SDK for the maintenance scripts (`user:grant`, `migrate:sqlite`).
 *
 * Target, from the command line:
 * - `--emulator`: the local emulators (`npm run emulators` / `npm run dev`), project
 *   `demo-daily-learning`;
 * - `--project <id>`: a real project. Credentials come from Application Default Credentials:
 *   `GOOGLE_APPLICATION_CREDENTIALS=secrets/<key>.json` (service account key, never committed) or
 *   `gcloud auth application-default login`.
 */
import { applicationDefault, initializeApp, type App } from 'firebase-admin/app';

export const DEMO_PROJECT_ID = 'demo-daily-learning';

export interface AdminTarget {
  emulator: boolean;
  project?: string;
}

export function initAdmin(target: AdminTarget): { app: App; projectId: string; label: string } {
  if (target.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    const app = initializeApp({ projectId: DEMO_PROJECT_ID });
    return { app, projectId: DEMO_PROJECT_ID, label: `emulator (${DEMO_PROJECT_ID})` };
  }
  if (!target.project) throw new Error('Pass --emulator or --project <firebase-project-id>');
  const app = initializeApp({ projectId: target.project, credential: applicationDefault() });
  return { app, projectId: target.project, label: `project ${target.project}` };
}

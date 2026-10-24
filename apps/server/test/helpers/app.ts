import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthMode } from '@daily-learning/shared/api';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { ROOT_DIR } from '../../src/config.js';
import { syncContent } from '../../src/content/sync.js';
import { openAndMigrate, type AppDatabase } from '../../src/db/client.js';

export interface TestApp {
  app: FastifyInstance;
  db: AppDatabase;
  close: () => Promise<void>;
}

/** A Fastify app on a temp SQLite file synced with the real `content/`. */
export async function createTestApp(authMode: AuthMode = 'none'): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'dl-api-'));
  const db = openAndMigrate(join(dir, 'app.db'));
  const r = syncContent({ contentDir: join(ROOT_DIR, 'content'), db });
  if (!r.ok) throw new Error(`content sync failed: ${JSON.stringify(r.issues)}`);
  const app = await buildApp({ db, authMode });
  return {
    app,
    db,
    close: async () => {
      await app.close();
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

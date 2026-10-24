import { join } from 'node:path';
import { buildApp } from './app.js';
import { loadEnvFile, readConfig, ROOT_DIR } from './config.js';
import { autoSyncContent } from './content/fingerprint.js';
import { openAndMigrate } from './db/client.js';
import { hasWebBuild } from './modules/static/web.js';

loadEnvFile();
let config;
try {
  // Also enforces the startup guard: no AUTH_MODE=none on a non-localhost HOST (plan 2.6).
  config = readConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
// Apply pending migrations before accepting requests (plan Phase 1 / Phase 7).
const db = openAndMigrate(config.dbPath);
const contentDir = join(ROOT_DIR, 'content');
const webDir = join(ROOT_DIR, 'apps/web/dist');
const webBuilt = hasWebBuild(webDir);
const app = await buildApp({
  db,
  authMode: config.authMode,
  displayName: config.displayName,
  contentDir,
  webDir: webBuilt ? webDir : undefined,
  fastify: { logger: true },
});

// Sync content/ when the DB has no lessons or content/ changed since the last sync (fingerprint.ts).
const started = Date.now();
const sync = autoSyncContent(db, contentDir);
const ms = Date.now() - started;
if (sync.status === 'skipped') {
  app.log.info(`content unchanged, sync skipped (${ms} ms)`);
} else if (sync.status === 'synced') {
  app.log.info(
    `content synced (${sync.reason}): ${sync.counts.lessons} lessons, ${sync.counts.words} words (${ms} ms)`,
  );
} else {
  app.log.error(
    `content sync failed (${sync.reason}); serving the existing database. ` +
      `Run \`npm run content:sync\` for details.\n${sync.message}`,
  );
}
if (!webBuilt) {
  app.log.warn(`no web build at ${webDir}: only the API is served (run \`npm run build\`)`);
}
app.addHook('onClose', () => {
  db.$client.close();
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`AUTH_MODE=${config.authMode}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

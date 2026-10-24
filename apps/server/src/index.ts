import { join } from 'node:path';
import { buildApp } from './app.js';
import { loadEnvFile, readConfig, ROOT_DIR } from './config.js';
import { openAndMigrate } from './db/client.js';

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
const app = await buildApp({
  db,
  authMode: config.authMode,
  displayName: config.displayName,
  contentDir: join(ROOT_DIR, 'content'),
  fastify: { logger: true },
});
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

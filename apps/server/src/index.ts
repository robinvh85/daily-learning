import { buildApp } from './app.js';
import { loadEnvFile, readConfig } from './config.js';
import { openAndMigrate } from './db/client.js';

loadEnvFile();
const config = readConfig();
// Apply pending migrations before accepting requests (plan Phase 1 / Phase 7).
const db = openAndMigrate(config.dbPath);
const app = buildApp({ logger: true });
app.addHook('onClose', () => {
  db.$client.close();
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

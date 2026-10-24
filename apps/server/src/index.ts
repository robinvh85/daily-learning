import { buildApp } from './app.js';
import { loadEnvFile, readConfig } from './config.js';

loadEnvFile();
const config = readConfig();
const app = buildApp({ logger: true });

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

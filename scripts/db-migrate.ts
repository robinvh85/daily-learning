// npm run db:migrate: apply pending SQL migrations to DB_PATH (default ./data/app.db).
import { loadEnvFile, resolveDbPath } from '../apps/server/src/config.js';
import { openAndMigrate } from '../apps/server/src/db/client.js';

loadEnvFile();
const path = resolveDbPath();
const db = openAndMigrate(path);
db.$client.close();
console.log(`Database is up to date: ${path}`);

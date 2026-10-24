import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { ROOT_DIR } from '../config.js';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/**
 * Generated SQL migrations (`npm run db:generate`). Resolved from the repo root so it works
 * from `src/`, `dist/` and the root `scripts/`.
 */
export const MIGRATIONS_DIR = join(ROOT_DIR, 'apps/server/src/db/migrations');

/**
 * Open (and create if needed) the SQLite database with the pragmas from plan 2.2:
 * WAL journal, foreign keys on, synchronous NORMAL.
 * Pass `:memory:` for an in-memory database (tests).
 */
export function openDatabase(path: string): AppDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}

/** Apply pending migrations. Safe to call on every start. */
export function migrateDatabase(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/** Open the database and apply migrations. */
export function openAndMigrate(path: string): AppDatabase {
  const db = openDatabase(path);
  migrateDatabase(db);
  return db;
}

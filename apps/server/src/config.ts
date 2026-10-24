import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTH_MODES, type AuthMode } from '@daily-learning/shared/api';

/** Repository root (works from both `src/` and `dist/`). */
export const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));

export interface ServerConfig {
  host: string;
  port: number;
  /** Absolute path of the SQLite file, or `:memory:`. */
  dbPath: string;
  authMode: AuthMode;
  /** `USER_DISPLAY_NAME`: name of the default local user (Home greeting). */
  displayName?: string;
}

/** Hosts that only accept connections from this machine. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/**
 * Startup guard (plan 2.6): without a login, the server may only listen on localhost.
 * Throws when `HOST` is reachable from other machines while `AUTH_MODE=none`.
 */
export function assertSafeBinding(config: Pick<ServerConfig, 'host' | 'authMode'>): void {
  if (config.authMode === 'none' && !isLoopbackHost(config.host)) {
    throw new Error(
      `Refusing to start: HOST=${config.host} exposes the app to other machines but AUTH_MODE=none. ` +
        'Use HOST=127.0.0.1, or set AUTH_MODE=password and create a user with `npm run user:create`.',
    );
  }
}

/** Load `<root>/.env` if present. Existing environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(`${ROOT_DIR}.env`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** `DB_PATH` from the environment (default `./data/app.db`), resolved against the repo root. */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DB_PATH?.trim() || './data/app.db';
  if (raw === ':memory:' || isAbsolute(raw)) return raw;
  return resolve(ROOT_DIR, raw);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const authMode = (env.AUTH_MODE?.trim() || 'none') as AuthMode;
  if (!AUTH_MODES.includes(authMode)) {
    throw new Error(`Invalid AUTH_MODE: ${env.AUTH_MODE} (use ${AUTH_MODES.join(' or ')})`);
  }
  const config: ServerConfig = {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    dbPath: resolveDbPath(env),
    authMode,
    displayName: env.USER_DISPLAY_NAME?.trim() || undefined,
  };
  assertSafeBinding(config);
  return config;
}

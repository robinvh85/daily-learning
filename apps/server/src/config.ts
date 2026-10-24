import { fileURLToPath } from 'node:url';

/** Repository root (works from both `src/` and `dist/`). */
export const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));

export interface ServerConfig {
  host: string;
  port: number;
}

/** Load `<root>/.env` if present. Existing environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(`${ROOT_DIR}.env`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return { host: env.HOST ?? '127.0.0.1', port };
}

import { fileURLToPath } from 'node:url';

/** Repository root (works from both `src/` and `dist/`). */
export const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/** Load `<root>/.env` if present. Existing environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(`${ROOT_DIR}.env`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

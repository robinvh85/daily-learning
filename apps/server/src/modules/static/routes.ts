/**
 * Static files from `content/` (plan 2.3): lesson audio, timings, covers and word audio.
 *
 * Only an allow-list is exposed: `*.mp3`, `*.webp`, `*.png`, `*.jpg` and `timings.json`, never
 * dotfiles (`.tts-cache.json`, `.tts-clips/`), YAML or anything else. URLs from the API carry a
 * `?v=<content hash>`, so files are cached for a year and a regenerated file gets a new URL.
 */
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export const CONTENT_PREFIX = '/content';

const ALLOWED =
  /^\/(?:lessons\/[^/]+\/[^/]+\/(?:audio\.mp3|timings\.json|cover\.(?:webp|png|jpe?g))|words\/[a-z0-9-]+\.mp3)$/;

/** True for paths (relative to the prefix, starting with `/`) that may be served. */
export function isPublicContentPath(pathName: string): boolean {
  if (pathName.split('/').some((part) => part.startsWith('.'))) return false;
  return ALLOWED.test(pathName);
}

export async function registerContentStatic(app: FastifyInstance, contentDir: string) {
  await app.register(fastifyStatic, {
    root: contentDir,
    prefix: `${CONTENT_PREFIX}/`,
    decorateReply: false,
    index: false,
    list: false,
    dotfiles: 'deny',
    allowedPath: (pathName) => isPublicContentPath(pathName),
    acceptRanges: true,
    maxAge: '365d',
    immutable: true,
  });
}

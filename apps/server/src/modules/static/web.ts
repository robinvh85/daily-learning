/**
 * Production web app (plan 2.1 "1 process Node serves API + React build", Phase 7).
 *
 * Serves `apps/web/dist` at `/`:
 * - `/assets/*` (Vite output with a content hash in the file name): cached for a year, immutable.
 * - `index.html` (also every SPA fallback): `no-cache`, so a new build is picked up on reload.
 * - Any other GET/HEAD that is not `/api/*`, `/content/*` or `/assets/*` falls back to
 *   `index.html`, so deep links such as `/read/a-new-coffee-shop` work after a reload.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { API_PREFIX } from '@daily-learning/shared';
import { CONTENT_PREFIX } from './routes.js';

export const ASSET_CACHE = 'public, max-age=31536000, immutable';
export const INDEX_CACHE = 'no-cache';

/** True when `dir` looks like a Vite build (has index.html). */
export function hasWebBuild(dir: string): boolean {
  return existsSync(join(dir, 'index.html'));
}

function isPrefixed(pathName: string, prefix: string): boolean {
  return pathName === prefix || pathName.startsWith(`${prefix}/`);
}

/** Paths that must answer 404 instead of the SPA's index.html. */
export function isSpaFallbackPath(url: string): boolean {
  const pathName = url.split('?')[0] ?? '/';
  return !(
    isPrefixed(pathName, API_PREFIX) ||
    isPrefixed(pathName, CONTENT_PREFIX) ||
    isPrefixed(pathName, '/assets')
  );
}

export async function registerWebStatic(app: FastifyInstance, webDir: string) {
  await app.register(fastifyStatic, {
    root: webDir,
    prefix: '/',
    index: ['index.html'],
    list: false,
    dotfiles: 'ignore',
    setHeaders: (reply, filePath) => {
      const normalized = filePath.replaceAll('\\', '/');
      if (normalized.endsWith('/index.html')) reply.header('cache-control', INDEX_CACHE);
      else if (normalized.includes('/assets/')) reply.header('cache-control', ASSET_CACHE);
      else reply.header('cache-control', 'public, max-age=3600');
    },
  });
}

/** SPA fallback for the not-found handler: returns true when it answered with index.html. */
export function trySpaFallback(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (!isSpaFallbackPath(request.url)) return false;
  reply.header('cache-control', INDEX_CACHE);
  reply.sendFile('index.html');
  return true;
}

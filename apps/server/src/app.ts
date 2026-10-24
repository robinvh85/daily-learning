import { API_PREFIX, type HealthResponse } from '@daily-learning/shared';
import type { AuthMode } from '@daily-learning/shared/api';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppDatabase } from './db/client.js';
import { registerErrorHandler } from './http.js';
import { systemClock, type Clock } from './services/srs.js';
import { activityRoutes } from './modules/activity/routes.js';
import { registerAuth } from './modules/auth/routes.js';
import { lessonRoutes } from './modules/lessons/routes.js';
import { reviewRoutes } from './modules/reviews/routes.js';
import { registerContentStatic } from './modules/static/routes.js';
import { registerWebStatic, trySpaFallback } from './modules/static/web.js';
import { todayRoutes } from './modules/today/routes.js';
import { vocabRoutes } from './modules/vocab/routes.js';

export interface AppOptions {
  db: AppDatabase;
  /** Default `none` (single local user). */
  authMode?: AuthMode;
  /** Serve lesson/word audio from this `content/` directory under `/content/`. */
  contentDir?: string;
  /** Source of "now" for scheduling (tests inject a fake clock). */
  now?: Clock;
  /** Serve the built web app (`apps/web/dist`) at `/` with an SPA fallback (production). */
  webDir?: string;
  /** Name of the default local user (`USER_DISPLAY_NAME`, AUTH_MODE=none). */
  displayName?: string;
  fastify?: FastifyServerOptions;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify(opts.fastify);
  registerErrorHandler(app, opts.webDir ? trySpaFallback : undefined);

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  });

  await registerAuth(app, {
    db: opts.db,
    authMode: opts.authMode ?? 'none',
    displayName: opts.displayName,
  });
  const now = opts.now ?? systemClock;
  lessonRoutes(app, opts.db, now);
  vocabRoutes(app, opts.db, now);
  reviewRoutes(app, opts.db, now);
  todayRoutes(app, opts.db, now);
  activityRoutes(app, opts.db, now);
  if (opts.contentDir) await registerContentStatic(app, opts.contentDir);
  if (opts.webDir) await registerWebStatic(app, opts.webDir);

  return app;
}

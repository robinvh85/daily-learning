import { API_PREFIX, type HealthResponse } from '@daily-learning/shared';
import type { AuthMode } from '@daily-learning/shared/api';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { AppDatabase } from './db/client.js';
import { registerErrorHandler } from './http.js';
import { registerAuth } from './modules/auth/routes.js';
import { lessonRoutes } from './modules/lessons/routes.js';
import { vocabRoutes } from './modules/vocab/routes.js';

export interface AppOptions {
  db: AppDatabase;
  /** Default `none` (single local user). */
  authMode?: AuthMode;
  fastify?: FastifyServerOptions;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify(opts.fastify);
  registerErrorHandler(app);

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  });

  await registerAuth(app, { db: opts.db, authMode: opts.authMode ?? 'none' });
  lessonRoutes(app, opts.db);
  vocabRoutes(app, opts.db);

  return app;
}

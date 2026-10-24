import { API_PREFIX, type HealthResponse } from '@daily-learning/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  });

  return app;
}

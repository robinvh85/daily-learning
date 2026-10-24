import type { ApiError } from '@daily-learning/shared/api';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

/** Error with an HTTP status, turned into an `ApiError` body by the error handler. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);

/** Validate request input with a Zod schema; throws a 400 `HttpError` on failure. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new HttpError(400, 'bad_request', z.prettifyError(r.error));
  }
  return r.data;
}

/** Optional handler tried before the JSON 404 (the SPA fallback); returns true when it replied. */
export type NotFoundFallback = (request: FastifyRequest, reply: FastifyReply) => boolean;

export function registerErrorHandler(app: FastifyInstance, fallback?: NotFoundFallback): void {
  app.setErrorHandler((err: FastifyError | HttpError, request, reply) => {
    if (err instanceof HttpError) {
      const body: ApiError = { error: err.code, message: err.message };
      return reply.code(err.statusCode).send(body);
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) request.log.error(err);
    const body: ApiError = {
      error: status >= 500 ? 'internal' : 'bad_request',
      message: status >= 500 ? 'Internal server error' : err.message,
    };
    return reply.code(status).send(body);
  });
  app.setNotFoundHandler((request, reply) => {
    if (fallback?.(request, reply)) return reply;
    const body: ApiError = {
      error: 'not_found',
      message: `Route ${request.method} ${request.url} not found`,
    };
    return reply.code(404).send(body);
  });
}

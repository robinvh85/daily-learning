/**
 * Authentication by `AUTH_MODE` (plan 2.6).
 *
 * - `none`: every request belongs to the default local user; no login routes.
 * - `password`: session cookie (httpOnly, SameSite=Lax, Secure unless the request is for
 *   localhost). Every `/api` route except health and `/api/auth/*` requires a session.
 */
import cookie from '@fastify/cookie';
import { API_PREFIX } from '@daily-learning/shared';
import {
  loginBodySchema,
  type AuthMode,
  type AuthUser,
  type MeResponse,
} from '@daily-learning/shared/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDatabase } from '../../db/client.js';
import { HttpError, parseInput } from '../../http.js';
import { isLoopbackHost } from '../../config.js';
import {
  createSession,
  deleteSession,
  ensureDefaultUser,
  findSessionUser,
  SESSION_TTL_MS,
  verifyLogin,
} from './users.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The current user, or null when not logged in (password mode only). */
    user: AuthUser | null;
  }
}

export const SESSION_COOKIE = 'dl_session';

/** Routes reachable without a session in password mode. */
const PUBLIC_ROUTES = new Set([
  `${API_PREFIX}/health`,
  `${API_PREFIX}/auth/login`,
  `${API_PREFIX}/auth/logout`,
  `${API_PREFIX}/auth/me`,
]);

/** Current user id; only call from routes that require a user. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new HttpError(401, 'unauthorized', 'Login required');
  return request.user;
}

function isSecureRequest(request: FastifyRequest): boolean {
  // Secure cookies are not sent over plain http://localhost, so keep them off there only.
  const host = request.hostname.replace(/:\d+$/, '');
  return !isLoopbackHost(host);
}

function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function registerAuth(
  app: FastifyInstance,
  opts: { db: AppDatabase; authMode: AuthMode; displayName?: string },
): Promise<void> {
  const { db, authMode } = opts;
  app.decorateRequest('user', null);

  if (authMode === 'none') {
    const defaultUser = ensureDefaultUser(db, opts.displayName);
    app.addHook('onRequest', async (request) => {
      request.user = defaultUser;
    });
  } else {
    await app.register(cookie);
    app.addHook('onRequest', async (request) => {
      const token = request.cookies[SESSION_COOKIE];
      request.user = token ? findSessionUser(db, token) : null;
      const path = request.url.split('?')[0] ?? '';
      if (!request.user && path.startsWith(`${API_PREFIX}/`) && !PUBLIC_ROUTES.has(path)) {
        throw new HttpError(401, 'unauthorized', 'Login required');
      }
    });

    app.post(`${API_PREFIX}/auth/login`, async (request, reply): Promise<MeResponse> => {
      const body = parseInput(loginBodySchema, request.body);
      const user = await verifyLogin(db, body.email, body.password);
      if (!user) throw new HttpError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng');
      setSessionCookie(request, reply, createSession(db, user.id));
      return { authMode, user };
    });

    app.post(`${API_PREFIX}/auth/logout`, async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) deleteSession(db, token);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(204).send();
    });
  }

  app.get(`${API_PREFIX}/auth/me`, async (request): Promise<MeResponse> => {
    return { authMode, user: request.user };
  });
}

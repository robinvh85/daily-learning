/** Dispatch an `/api/*` path (without the prefix) to its handler. */
import type {
  AnswerBody,
  LoginBody,
  MeResponse,
  ProgressBody,
  ReviewBody,
  SaveWordBody,
  VocabListQuery,
} from '@daily-learning/shared/api';
import type { LessonKind, LessonLevel } from '@daily-learning/shared';
import { ApiRequestError } from '../api/errors';
import type { ApiInit } from '../api/client';
import * as h from './handlers';

export interface RouterDeps {
  me(): Promise<MeResponse>;
  login(body: LoginBody): Promise<MeResponse>;
  logout(): Promise<void>;
  /** The signed-in learner's context; throws 401 when nobody is signed in. */
  context(): Promise<h.BackendContext>;
}

type Handler = (
  m: string[],
  q: URLSearchParams,
  body: unknown,
  deps: RouterDeps,
) => Promise<unknown>;

const id = (s: string | undefined): number => {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ApiRequestError(400, 'bad_request', 'bad id');
  return n;
};
const str = (v: string | null) => v ?? undefined;
const body = <T>(b: unknown): T => {
  if (b === null || typeof b !== 'object') {
    throw new ApiRequestError(400, 'bad_request', 'JSON body expected');
  }
  return b as T;
};

const routes: [method: string, pattern: RegExp, handler: Handler][] = [
  ['GET', /^\/auth\/me$/, (_m, _q, _b, d) => d.me()],
  ['POST', /^\/auth\/login$/, (_m, _q, b, d) => d.login(body<LoginBody>(b))],
  ['POST', /^\/auth\/logout$/, (_m, _q, _b, d) => d.logout()],

  [
    'GET',
    /^\/lessons$/,
    async (_m, q, _b, d) =>
      h.listLessons(await d.context(), {
        kind: str(q.get('kind')) as LessonKind | undefined,
        level: str(q.get('level')) as LessonLevel | undefined,
        topic: str(q.get('topic')),
      }),
  ],
  ['GET', /^\/lessons\/([^/]+)$/, async (m, _q, _b, d) => h.getLesson(await d.context(), m[1]!)],
  [
    'POST',
    /^\/lessons\/([^/]+)\/answers$/,
    async (m, _q, b, d) => h.submitAnswer(await d.context(), m[1]!, body<AnswerBody>(b)),
  ],
  [
    'POST',
    /^\/lessons\/([^/]+)\/progress$/,
    async (m, _q, b, d) => h.updateProgress(await d.context(), m[1]!, body<ProgressBody>(b)),
  ],

  [
    'GET',
    /^\/vocab\/saved$/,
    async (_m, q, _b, d) => h.listSavedWordIds(await d.context(), str(q.get('lesson'))),
  ],
  ['GET', /^\/vocab\/stats$/, async (_m, _q, _b, d) => h.vocabStats(await d.context())],
  [
    'GET',
    /^\/vocab$/,
    async (_m, q, _b, d) =>
      h.listVocab(await d.context(), {
        source: str(q.get('source')) as VocabListQuery['source'],
        status: str(q.get('status')) as VocabListQuery['status'],
      }),
  ],
  [
    'POST',
    /^\/vocab\/(\d+)$/,
    async (m, _q, b, d) => h.saveWord(await d.context(), id(m[1]), (b ?? {}) as SaveWordBody),
  ],
  ['DELETE', /^\/vocab\/(\d+)$/, async (m, _q, _b, d) => h.removeWord(await d.context(), id(m[1]))],

  [
    'GET',
    /^\/reviews\/due$/,
    async (_m, q, _b, d) => h.dueReviews(await d.context(), Number(q.get('limit') ?? 50) || 50),
  ],
  [
    'GET',
    /^\/reviews\/card\/(\d+)$/,
    async (m, _q, _b, d) => h.getReviewCard(await d.context(), id(m[1])),
  ],
  [
    'POST',
    /^\/reviews\/(\d+)\/postpone$/,
    async (m, _q, _b, d) => h.postponeReview(await d.context(), id(m[1])),
  ],
  [
    'POST',
    /^\/reviews\/(\d+)$/,
    async (m, _q, b, d) => h.submitReview(await d.context(), id(m[1]), body<ReviewBody>(b).rating),
  ],

  ['GET', /^\/today$/, async (_m, _q, _b, d) => h.today(await d.context())],
  ['GET', /^\/dashboard$/, async (_m, _q, _b, d) => h.dashboard(await d.context())],
  [
    'POST',
    /^\/activity\/heartbeat$/,
    async (_m, _q, b, d) =>
      h.heartbeat(await d.context(), Number(body<{ seconds: unknown }>(b).seconds)),
  ],
];

export async function route(path: string, init: ApiInit, deps: RouterDeps): Promise<unknown> {
  const url = new URL(path, 'http://backend');
  const method = (init.method ?? 'GET').toUpperCase();
  const pathname = decodeURIComponent(url.pathname);
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const match = pattern.exec(pathname);
    if (match) return handler(match, url.searchParams, init.body, deps);
  }
  throw new ApiRequestError(404, 'not_found', `${method} ${pathname} not found`);
}

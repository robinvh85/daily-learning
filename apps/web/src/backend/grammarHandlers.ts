/**
 * `/api/grammar/*` (grammar plan sections 3 and 5): the grammar library, one grammar point with
 * its exercises (answers stay here), answer checking and progress.
 */
import type {
  GrammarAnswerBody,
  GrammarAnswerResponse,
  GrammarDetailResponse,
  GrammarExerciseDto,
  GrammarListResponse,
  GrammarProgressBody,
  GrammarProgressDto,
  GrammarProgressResponse,
  GrammarSummary,
} from '@daily-learning/shared/api';
import type {
  CatalogGrammarPoint,
  GrammarExerciseData,
  GrammarPointData,
} from '@daily-learning/shared/content-data';
import { ApiRequestError } from '../api/errors';
import type { BackendContext } from './handlers';
import { normalizeDictation } from './logic/dailyPlan';
import type { ProgressDoc, UserStore } from './userStore';

const GRAMMAR_STEPS = 3;

function toGrammarProgress(p: ProgressDoc | undefined): GrammarProgressDto | null {
  if (!p) return null;
  return {
    status: p.status,
    step: p.step,
    score: p.score,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  };
}

export function grammarSummary(g: CatalogGrammarPoint, store: UserStore): GrammarSummary {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    titleEn: g.titleEn,
    level: g.level,
    group: g.group,
    summary: g.summary,
    draft: g.status === 'draft',
    exerciseCount: g.exerciseCount,
    days: g.days,
    progress: toGrammarProgress(store.grammarProgress.get(g.slug)),
  };
}

async function loadGrammar(
  ctx: BackendContext,
  slug: string,
): Promise<{ point: CatalogGrammarPoint; data: GrammarPointData }> {
  const index = await ctx.content.catalog();
  const point = index.grammarBySlug.get(slug);
  const data = point ? await ctx.content.grammar(slug) : null;
  if (!point || !data) throw new ApiRequestError(404, 'not_found', `Grammar "${slug}" not found`);
  return { point, data };
}

export async function listGrammar(ctx: BackendContext): Promise<GrammarListResponse> {
  const index = await ctx.content.catalog();
  return { points: (index.catalog.grammar ?? []).map((g) => grammarSummary(g, ctx.store)) };
}

function exerciseDto(e: GrammarExerciseData): GrammarExerciseDto {
  switch (e.type) {
    case 'choice':
      return { type: e.type, id: e.id, idx: e.idx, prompt: e.prompt, options: e.options };
    case 'gap':
      return { type: e.type, id: e.id, idx: e.idx, prompt: e.prompt };
    case 'order':
      return { type: e.type, id: e.id, idx: e.idx, words: e.words };
    case 'find_error':
      return { type: e.type, id: e.id, idx: e.idx, sentence: e.sentence };
  }
}

export async function getGrammar(
  ctx: BackendContext,
  slug: string,
): Promise<GrammarDetailResponse> {
  const { point, data } = await loadGrammar(ctx, slug);
  return {
    point: grammarSummary(point, ctx.store),
    discover: {
      question: data.discover.question,
      answer: data.discover.answer,
      examples: data.discover.examples.map((e) => ({
        source: e.source,
        lessonSlug: e.lessonSlug,
        lessonKind: e.lessonKind,
        lessonTitle: e.lessonTitle,
        segmentKey: e.segmentKey,
        textEn: e.textEn,
        textVi: e.textVi,
        ranges: e.ranges,
        notes: e.notes,
      })),
    },
    form: data.form,
    usage: data.usage,
    signals: data.signals,
    spelling: data.spelling,
    mistakes: data.mistakes,
    exercises: data.exercises.map(exerciseDto),
  };
}

/** Compare typed answers: case, punctuation, curly apostrophes and extra spaces do not count. */
const same = (a: string, b: string) => normalizeDictation(a) === normalizeDictation(b);

/** Check one answer; pure, exported for tests. */
export function checkGrammarAnswer(
  e: GrammarExerciseData,
  body: Pick<GrammarAnswerBody, 'value' | 'correction'>,
): { correct: boolean; expected: string } {
  const text = typeof body.value === 'string' ? body.value.slice(0, 300) : '';
  switch (e.type) {
    case 'choice': {
      const v = body.value;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= e.options.length) {
        throw new ApiRequestError(400, 'bad_request', 'value must be an option index');
      }
      return { correct: v === e.correctIdx, expected: e.options[e.correctIdx]! };
    }
    case 'gap':
      return { correct: [e.answer, ...e.accept].some((a) => same(a, text)), expected: e.answer };
    case 'order':
      return { correct: same(text, e.answer), expected: e.answer };
    case 'find_error': {
      const correction = (body.correction ?? '').slice(0, 300);
      return {
        correct: same(text, e.wrong) && same(correction, e.right),
        expected: `${e.wrong} → ${e.right}`,
      };
    }
  }
}

export async function submitGrammarAnswer(
  ctx: BackendContext,
  slug: string,
  body: GrammarAnswerBody,
): Promise<GrammarAnswerResponse> {
  const { data } = await loadGrammar(ctx, slug);
  const e = data.exercises.find((x) => x.id === body.exerciseId);
  if (!e) throw new ApiRequestError(404, 'not_found', `Exercise ${body.exerciseId} not found`);
  const { correct, expected } = checkGrammarAnswer(e, body);
  const value =
    e.type === 'find_error'
      ? `${String(body.value)} → ${body.correction ?? ''}`
      : String(body.value).slice(0, 300);
  await ctx.store.addGrammarAnswer({
    grammar: slug,
    exercise: e.idx,
    value,
    correct,
    at: ctx.now(),
  });
  return { correct, expected, explain: e.explain };
}

export async function updateGrammarProgress(
  ctx: BackendContext,
  slug: string,
  body: GrammarProgressBody,
): Promise<GrammarProgressResponse> {
  await loadGrammar(ctx, slug);
  if (!Number.isInteger(body.step) || body.step < 0 || body.step >= GRAMMAR_STEPS) {
    throw new ApiRequestError(400, 'bad_request', `step must be 0..${GRAMMAR_STEPS - 1}`);
  }
  const t = ctx.now();
  const prev = ctx.store.grammarProgress.get(slug);
  // Completed stays completed and the step never goes back; a new full attempt updates the score.
  const wasCompleted = prev?.status === 'completed';
  const status = wasCompleted ? 'completed' : (body.status ?? 'in_progress');
  const next: ProgressDoc = {
    status,
    step: Math.max(prev?.step ?? 0, body.step),
    score: body.score === undefined ? (prev?.score ?? null) : body.score,
    completedAt: status === 'completed' ? (prev?.completedAt ?? t) : null,
    updatedAt: t,
  };
  await ctx.store.saveGrammarProgress(slug, next);
  return { progress: toGrammarProgress(next)! };
}

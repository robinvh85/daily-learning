/** TanStack Query hooks for the REST API (plan section 5). */
import type {
  AnswerBody,
  AnswerResponse,
  DashboardResponse,
  DueReviewsResponse,
  GrammarAnswerBody,
  GrammarAnswerResponse,
  GrammarDetailResponse,
  GrammarListResponse,
  GrammarProgressBody,
  GrammarProgressResponse,
  LessonDetailResponse,
  LessonListQuery,
  LessonListResponse,
  MeResponse,
  PostponeResponse,
  ProgressBody,
  ProgressResponse,
  ReviewBody,
  ReviewCardResponse,
  ReviewResponse,
  SavedWordResponse,
  SavedWordsResponse,
  SaveWordBody,
  TodayResponse,
  VocabListQuery,
  VocabListResponse,
  VocabStatsResponse,
} from '@daily-learning/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  lessons: (q: LessonListQuery = {}) => ['lessons', q] as const,
  lesson: (slug: string) => ['lesson', slug] as const,
  saved: (slug?: string) => ['vocab', 'saved', slug ?? null] as const,
  vocabList: (q: VocabListQuery) =>
    ['vocab', 'list', q.source ?? 'all', q.status ?? 'all'] as const,
  vocabStats: ['vocab', 'stats'] as const,
  dueReviews: ['reviews', 'due'] as const,
  reviewCard: (wordId: number | null) => ['reviews', 'card', wordId] as const,
  grammarList: ['grammar', 'list'] as const,
  grammar: (slug: string) => ['grammar', 'point', slug] as const,
  today: ['home', 'today'] as const,
  dashboard: ['home', 'dashboard'] as const,
};

/** After saving, removing or reviewing a word: word book, stats (Sidebar badge) and queue. */
function invalidateVocab(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['vocab'] });
  void qc.invalidateQueries({ queryKey: ['reviews'] });
  void qc.invalidateQueries({ queryKey: ['home'] });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api<MeResponse>('/auth/me', { signal }),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<MeResponse>('/auth/login', { method: 'POST' }),
    onSuccess: (me) => {
      qc.setQueryData(queryKeys.me, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Drop the previous user's data, then show the login page right away. (`clear()` alone
      // also removes the `me` query under its observer, so the page would not change.)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
      qc.setQueryData<MeResponse>(queryKeys.me, { authMode: 'password', user: null });
    },
  });
}

export function useLessons(q: LessonListQuery = {}) {
  const search = new URLSearchParams();
  if (q.kind) search.set('kind', q.kind);
  if (q.level) search.set('level', q.level);
  if (q.topic) search.set('topic', q.topic);
  const params = search.toString();
  return useQuery({
    queryKey: queryKeys.lessons(q),
    queryFn: ({ signal }) =>
      api<LessonListResponse>(`/lessons${params ? `?${params}` : ''}`, { signal }),
  });
}

export function useLesson(slug: string) {
  return useQuery({
    queryKey: queryKeys.lesson(slug),
    queryFn: ({ signal }) =>
      api<LessonDetailResponse>(`/lessons/${encodeURIComponent(slug)}`, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubmitAnswer(slug: string) {
  return useMutation({
    mutationFn: (body: AnswerBody) =>
      api<AnswerResponse>(`/lessons/${encodeURIComponent(slug)}/answers`, { method: 'POST', body }),
  });
}

export function useUpdateProgress(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProgressBody) =>
      api<ProgressResponse>(`/lessons/${encodeURIComponent(slug)}/progress`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useSavedWords(slug?: string) {
  return useQuery({
    queryKey: queryKeys.saved(slug),
    queryFn: ({ signal }) =>
      api<SavedWordsResponse>(`/vocab/saved${slug ? `?lesson=${encodeURIComponent(slug)}` : ''}`, {
        signal,
      }),
  });
}

/** Save or unsave a word; updates the saved list optimistically. */
export function useToggleSavedWord(slug?: string) {
  const qc = useQueryClient();
  const key = queryKeys.saved(slug);
  return useMutation({
    mutationFn: (v: { wordId: number; save: boolean } & SaveWordBody) =>
      v.save
        ? api<SavedWordResponse>(`/vocab/${v.wordId}`, {
            method: 'POST',
            body: { senseId: v.senseId ?? null, sourceLessonId: v.sourceLessonId ?? null },
          })
        : api<SavedWordResponse>(`/vocab/${v.wordId}`, { method: 'DELETE' }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SavedWordsResponse>(key);
      const ids = new Set(prev?.wordIds ?? []);
      if (v.save) ids.add(v.wordId);
      else ids.delete(v.wordId);
      qc.setQueryData<SavedWordsResponse>(key, { wordIds: [...ids] });
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => invalidateVocab(qc),
  });
}

/** Totals per status and the due count (Sidebar badge). Refreshed every minute. */
export function useVocabStats(enabled = true) {
  return useQuery({
    queryKey: queryKeys.vocabStats,
    enabled,
    queryFn: ({ signal }) => api<VocabStatsResponse>('/vocab/stats', { signal }),
    refetchInterval: 60_000,
  });
}

export function useVocabList(q: VocabListQuery) {
  const source = q.source ?? 'all';
  const status = q.status ?? 'all';
  return useQuery({
    queryKey: queryKeys.vocabList(q),
    queryFn: ({ signal }) =>
      api<VocabListResponse>(`/vocab?source=${source}&status=${status}`, { signal }),
    placeholderData: (prev) => prev,
  });
}

export function useRemoveWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wordId: number) =>
      api<SavedWordResponse>(`/vocab/${wordId}`, { method: 'DELETE' }),
    onSettled: () => invalidateVocab(qc),
  });
}

export function useDueReviews() {
  return useQuery({
    queryKey: queryKeys.dueReviews,
    queryFn: ({ signal }) => api<DueReviewsResponse>('/reviews/due', { signal }),
  });
}

/** A saved word picked from the word book, due or not (`null`: nothing picked). */
export function useReviewCard(wordId: number | null) {
  return useQuery({
    queryKey: queryKeys.reviewCard(wordId),
    enabled: wordId !== null,
    queryFn: ({ signal }) => api<ReviewCardResponse>(`/reviews/card/${wordId}`, { signal }),
  });
}

/** The answered card leaves the local queue at once (the refetch follows). */
function dropFromQueue(
  qc: ReturnType<typeof useQueryClient>,
  res: { wordId: number; counts: DueReviewsResponse['counts'] },
) {
  qc.setQueryData<DueReviewsResponse>(queryKeys.dueReviews, (prev) =>
    prev
      ? { ...prev, cards: prev.cards.filter((c) => c.wordId !== res.wordId), counts: res.counts }
      : prev,
  );
}

/** Rate a card. The card leaves the local queue at once; then everything is refetched. */
export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { wordId: number } & ReviewBody) =>
      api<ReviewResponse>(`/reviews/${v.wordId}`, { method: 'POST', body: { rating: v.rating } }),
    onSuccess: (res) => dropFromQueue(qc, res),
    onSettled: () => invalidateVocab(qc),
  });
}

/** "Mai ôn": the card is due again tomorrow, without a rating. */
export function usePostponeReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wordId: number) =>
      api<PostponeResponse>(`/reviews/${wordId}/postpone`, { method: 'POST' }),
    onSuccess: (res) => dropFromQueue(qc, res),
    onSettled: () => invalidateVocab(qc),
  });
}

/** Grammar library with the learner's progress. */
export function useGrammarList() {
  return useQuery({
    queryKey: queryKeys.grammarList,
    queryFn: ({ signal }) => api<GrammarListResponse>('/grammar', { signal }),
  });
}

/** One grammar point (exercises without answers). */
export function useGrammar(slug: string) {
  return useQuery({
    queryKey: queryKeys.grammar(slug),
    queryFn: ({ signal }) =>
      api<GrammarDetailResponse>(`/grammar/${encodeURIComponent(slug)}`, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubmitGrammarAnswer(slug: string) {
  return useMutation({
    mutationFn: (body: GrammarAnswerBody) =>
      api<GrammarAnswerResponse>(`/grammar/${encodeURIComponent(slug)}/answers`, {
        method: 'POST',
        body,
      }),
  });
}

export function useUpdateGrammarProgress(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GrammarProgressBody) =>
      api<GrammarProgressResponse>(`/grammar/${encodeURIComponent(slug)}/progress`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.grammarList });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

/** Today's lesson: plan day, 3 steps and where to continue. */
export function useToday() {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: ({ signal }) => api<TodayResponse>('/today', { signal }),
  });
}

/** Streak, path progress, words and this week's study time. */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: ({ signal }) => api<DashboardResponse>('/dashboard', { signal }),
  });
}

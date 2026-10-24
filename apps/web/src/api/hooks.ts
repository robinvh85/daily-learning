/** TanStack Query hooks for the REST API (plan section 5). */
import type {
  AnswerBody,
  AnswerResponse,
  LessonDetailResponse,
  LessonListQuery,
  LessonListResponse,
  LoginBody,
  MeResponse,
  ProgressBody,
  ProgressResponse,
  SavedWordResponse,
  SavedWordsResponse,
  SaveWordBody,
} from '@daily-learning/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  lessons: (q: LessonListQuery = {}) => ['lessons', q] as const,
  lesson: (slug: string) => ['lesson', slug] as const,
  saved: (slug?: string) => ['vocab', 'saved', slug ?? null] as const,
};

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
    mutationFn: (body: LoginBody) => api<MeResponse>('/auth/login', { method: 'POST', body }),
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
      qc.clear();
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useLessons(q: LessonListQuery = {}) {
  const search = new URLSearchParams();
  if (q.kind) search.set('kind', q.kind);
  if (q.level) search.set('level', q.level);
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['vocab'] });
    },
  });
}

import { useEffect } from 'react';

export const APP_NAME = 'DailyLearning';

/** `"<page> · DailyLearning"`, or just the app name. */
export function formatTitle(page?: string | null): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}

/** Give every route its own document title (screen readers announce it, tabs show it). */
export function useDocumentTitle(page?: string | null): void {
  useEffect(() => {
    document.title = formatTitle(page);
  }, [page]);
}

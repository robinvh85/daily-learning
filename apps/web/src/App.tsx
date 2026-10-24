import type { HealthResponse } from '@daily-learning/shared';
import { useEffect, useState } from 'react';
import { fetchHealth } from './api/health';

type HealthState =
  { kind: 'loading' } | { kind: 'ok'; data: HealthResponse } | { kind: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((data) => setHealth({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="app">
      <h1>DailyLearning</h1>
      <p className="subtitle">Học tiếng Anh mỗi ngày: Đọc và Nghe (A2 → B1)</p>
      <section className="card" aria-live="polite">
        <h2>Trạng thái máy chủ</h2>
        {health.kind === 'loading' && <p>Đang kiểm tra kết nối…</p>}
        {health.kind === 'ok' && (
          <p className="ok">
            Máy chủ hoạt động bình thường (status: {health.data.status}, uptime:{' '}
            {health.data.uptime}s)
          </p>
        )}
        {health.kind === 'error' && (
          <p className="error" role="alert">
            Không kết nối được máy chủ: {health.message}
          </p>
        )}
      </section>
    </main>
  );
}

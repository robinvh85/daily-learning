import type { GrammarReviewsResponse } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrammarReviewPage } from '../src/pages/Grammar/GrammarReviewPage';
import { expectNoAxeViolations } from './axe';

const point = (slug: string, title: string) => ({
  id: slug.length,
  slug,
  title,
  titleEn: title,
  level: 'A2' as const,
  group: 'tenses' as const,
  summary: '-',
  draft: false,
  exerciseCount: 8,
  days: [1],
  progress: { status: 'completed' as const, step: 2, score: 1, completedAt: null },
});

let queue: GrammarReviewsResponse;
let calls: { url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  queue = {
    items: [
      {
        point: point('past-simple-regular', 'Quá khứ đơn'),
        due: '2026-11-14T00:00:00Z',
        exercises: [
          { type: 'choice', id: 1, idx: 0, prompt: 'We ___ home.', options: ['walk', 'walked'] },
          { type: 'gap', id: 2, idx: 1, prompt: 'She ___ (try) it.' },
        ],
      },
      {
        point: point('too-adjective', 'too + tính từ'),
        due: '2026-11-14T01:00:00Z',
        exercises: [
          {
            type: 'choice',
            id: 3,
            idx: 0,
            prompt: 'It is ___ small.',
            options: ['too', 'very much'],
          },
        ],
      },
    ],
    nextDueAt: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      const json = (data: unknown) => new Response(JSON.stringify(data));
      if (url === '/api/grammar/reviews') return json(queue);
      if (url.endsWith('/answers')) {
        const correct = body.value === 1 || body.value === 'tried' || body.value === 0;
        return json({
          correct: body.exerciseId === 1 ? body.value === 1 : correct,
          expected: '-',
          explain: 'x',
        });
      }
      if (url.endsWith('/review')) {
        return json({ slug: '-', rating: 3, due: '2026-11-17T00:00:00Z', scheduledDays: 3 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/grammar/review']}>
        <Routes>
          <Route path="/grammar/review" element={<GrammarReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GrammarReviewPage', () => {
  it('reviews each due point and sends the score of its exercises', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'Quá khứ đơn' })).toBeInTheDocument();
    expect(screen.getByText('Điểm 1/2')).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(
      within(screen.getByTestId('exercise-1')).getByRole('button', { name: 'walk' }),
    );
    expect(calls.some((c) => c.url.endsWith('/review'))).toBe(false);
    const ex2 = screen.getByTestId('exercise-2');
    await user.type(within(ex2).getByRole('textbox'), 'tried');
    await user.click(within(ex2).getByRole('button', { name: 'Kiểm tra' }));

    expect(await screen.findByText('Đúng 1/2 câu. Ôn lại sau 3 ngày.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/review'))).toEqual({
      url: '/api/grammar/past-simple-regular/review',
      body: { correct: 1, total: 2 },
    });

    await user.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(await screen.findByRole('heading', { name: 'too + tính từ' })).toBeInTheDocument();
    await user.click(within(screen.getByTestId('exercise-1')).getByRole('button', { name: 'too' }));
    await user.click(await screen.findByRole('button', { name: 'Tiếp' }));
    expect(screen.getByText('Xong! Bạn đã ôn 2 điểm ngữ pháp.')).toBeInTheDocument();
  });

  it('says when nothing is due', async () => {
    queue = { items: [], nextDueAt: null };
    renderPage();
    expect(await screen.findByText('Không có điểm ngữ pháp nào đến hạn ôn.')).toBeInTheDocument();
  });
});

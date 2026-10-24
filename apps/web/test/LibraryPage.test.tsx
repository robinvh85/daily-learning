import type { LessonListResponse, LessonSummary } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryPage } from '../src/pages/Library/LibraryPage';

const lesson = (id: number, extra: Partial<LessonSummary>): LessonSummary => ({
  id,
  slug: `lesson-${id}`,
  kind: 'reading',
  level: 'A2',
  title: `Lesson ${id}`,
  topic: 'daily-life',
  wordCount: 240,
  durationMs: null,
  audioUrl: null,
  orderIndex: id,
  progress: null,
  ...extra,
});

const data: LessonListResponse = {
  lessons: [
    lesson(1, {
      title: 'A New Coffee Shop',
      progress: { status: 'completed', step: 2, score: 1, completedAt: '2026-10-24T02:00:00Z' },
    }),
    lesson(2, {
      title: 'Weekend Plans',
      level: 'A2+',
      topic: 'travel',
      progress: { status: 'in_progress', step: 1, score: null, completedAt: null },
    }),
    lesson(3, { title: 'Ordering Food', topic: 'travel' }),
  ],
};

function renderLibrary() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data)))),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read']}>
        <LibraryPage kind="reading" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LibraryPage', () => {
  it('shows every lesson with its status', async () => {
    renderLibrary();
    expect(await screen.findByRole('heading', { name: 'Thư viện bài đọc' })).toBeInTheDocument();
    expect(await screen.findByText('3 bài')).toBeInTheDocument();
    const cards = screen.getAllByRole('link', { name: /Lesson|Shop|Plans|Food/ });
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Đã xong'),
      expect.stringContaining('Đang học'),
      expect.stringContaining('Chưa học'),
    ]);
    expect(cards[0]).toHaveAttribute('href', '/read/lesson-1');
    expect(cards[0]).toHaveTextContent('240 từ · 2 phút');
  });

  it('filters by level and topic, offering only values that exist', async () => {
    renderLibrary();
    const levels = await screen.findByRole('group', { name: 'Lọc theo cấp độ' });
    expect(
      within(levels)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Tất cả', 'A2', 'A2+']);
    const user = userEvent.setup();
    await user.click(within(levels).getByRole('button', { name: 'A2' }));
    expect(within(levels).getByRole('button', { name: 'A2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('2 bài')).toBeInTheDocument();

    const topics = screen.getByRole('group', { name: 'Lọc theo chủ đề' });
    await user.click(within(topics).getByRole('button', { name: 'Du lịch' }));
    expect(screen.getByText('1 bài')).toBeInTheDocument();
    expect(screen.getByText('Ordering Food')).toBeInTheDocument();

    await user.click(within(levels).getByRole('button', { name: 'A2+' }));
    await user.click(within(topics).getByRole('button', { name: 'Đời sống hằng ngày' }));
    expect(screen.getByText('0 bài')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bỏ lọc' }));
    expect(screen.getByText('3 bài')).toBeInTheDocument();
  });
});

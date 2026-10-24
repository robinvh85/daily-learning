import type {
  DueReviewsResponse,
  ReviewCardDto,
  ReviewResponse,
  VocabListResponse,
} from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { VocabPage } from '../src/pages/Vocab/VocabPage';
import { installMediaStub, lastPlayer } from './media';
import { expectNoAxeViolations } from './axe';

const card = (
  wordId: number,
  lemma: string,
  extra: Partial<ReviewCardDto> = {},
): ReviewCardDto => ({
  wordId,
  lemma,
  ipaUs: '/rʌn/',
  pos: 'verb',
  meaningVi: `nghĩa của ${lemma}`,
  example: `I ${lemma} every day.`,
  sourceLesson: { id: 1, slug: 'a-new-coffee-shop', kind: 'reading', title: 'A New Coffee Shop' },
  audioUrl: null,
  status: 'new',
  due: '2026-10-24T02:00:00.000Z',
  previews: [
    { rating: 1, due: '', interval: '1 phút' },
    { rating: 2, due: '', interval: '6 phút' },
    { rating: 3, due: '', interval: '10 phút' },
    { rating: 4, due: '', interval: '8 ngày' },
  ],
  ...extra,
});

const book: VocabListResponse = {
  items: [
    {
      wordId: 1,
      lemma: 'run',
      meaningVi: 'điều hành',
      status: 'learning',
      sourceLesson: null,
      due: '',
      savedAt: '',
    },
    {
      wordId: 2,
      lemma: 'platform',
      meaningVi: 'sân ga',
      status: 'new',
      sourceLesson: null,
      due: '',
      savedAt: '',
    },
  ],
};

interface Setup {
  due: DueReviewsResponse;
}

function renderPage({ due }: Setup) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let current = due;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data)));
    if (url === '/api/reviews/due') return json(current);
    if (url.startsWith('/api/vocab?')) {
      const status = new URL(url, 'http://x').searchParams.get('status');
      return json({
        items: book.items.filter((i) => status === 'all' || i.status === status),
      });
    }
    const review = url.match(/^\/api\/reviews\/(\d+)$/);
    if (review && method === 'POST') {
      const wordId = Number(review[1]);
      current = {
        ...current,
        cards: current.cards.filter((c) => c.wordId !== wordId),
        counts: { due: current.counts.due - 1, doneToday: current.counts.doneToday + 1 },
      };
      const res: ReviewResponse = {
        wordId,
        rating: body.rating,
        card: {
          due: '',
          state: 1,
          status: 'learning',
          stability: 1,
          difficulty: 5,
          reps: 1,
          lapses: 0,
          scheduledDays: 0,
          lastReview: null,
        },
        counts: current.counts,
      };
      return json(res);
    }
    if (url.startsWith('/api/vocab/') && method === 'DELETE')
      return json({ wordId: 1, senseId: null, saved: false });
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/vocab']}>
        <VocabPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, calls };
}

const twoCards: DueReviewsResponse = {
  cards: [card(1, 'run', { audioUrl: '/content/words/run.mp3?v=1' }), card(2, 'platform')],
  counts: { due: 2, doneToday: 3 },
  nextDueAt: null,
};

describe('VocabPage', () => {
  it('shows today’s progress and the front of the first due card', async () => {
    renderPage({ due: twoCards });
    expect(await screen.findByRole('heading', { name: 'run' })).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByText(/Từ bài:/)).toHaveTextContent('Từ bài: A New Coffee Shop');
    expect(screen.getByText('“I run every day.”')).toBeInTheDocument();
    // Meaning is hidden until the card is flipped.
    expect(screen.queryByText('nghĩa của run')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Bạn nhớ từ này thế nào?' })).toBeNull();
  });

  it('flips with the button and shows the real FSRS intervals', async () => {
    const user = userEvent.setup();
    renderPage({ due: twoCards });
    await user.click(await screen.findByRole('button', { name: 'Xem nghĩa' }));
    expect(screen.getByText('nghĩa của run')).toBeInTheDocument();
    expect(screen.getByText('động từ')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Bạn nhớ từ này thế nào?' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Quên1 phút', 'Khó6 phút', 'Nhớ10 phút', 'Dễ8 ngày']);
    expect(group).toHaveFocus();
  });

  it('flips with Space and rates with the number keys, then shows the next card', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    // Number keys do nothing on the front side.
    await user.keyboard('3');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.keyboard(' ');
    expect(screen.getByText('nghĩa của run')).toBeInTheDocument();
    await user.keyboard('3');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        url: '/api/reviews/1',
        body: { rating: 3 },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'platform' })).toBeInTheDocument();
    expect(screen.queryByText('nghĩa của platform')).toBeNull();
    expect(await screen.findByText('4 / 5')).toBeInTheDocument();
    // Enter flips the next card.
    await user.keyboard('{Enter}');
    expect(screen.getByText('nghĩa của platform')).toBeInTheDocument();
  });

  it('ignores card shortcuts inside the word book', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    const chip = await screen.findByRole('button', { name: 'Từ bài đọc' });
    chip.focus();
    await user.keyboard(' ');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('nghĩa của run')).toBeNull();
    await user.keyboard('1');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('removes the keyboard listener on unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    remove.mockRestore();
  });

  it('plays the word audio', async () => {
    const stub = installMediaStub();
    try {
      renderPage({ due: twoCards });
      const btn = await screen.findByRole('button', { name: 'Nghe phát âm run' });
      await userEvent.setup().click(btn);
      expect(stub.play).toHaveBeenCalledTimes(1);
      expect(lastPlayer().getAttribute('src')).toBe('/content/words/run.mp3?v=1');
    } finally {
      stub.restore();
    }
  });

  it('shows an empty state with the next due time and lesson links', async () => {
    renderPage({
      due: {
        cards: [],
        counts: { due: 0, doneToday: 4 },
        nextDueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Xong rồi! Bạn đã ôn hết thẻ hôm nay.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Thẻ tiếp theo đến hạn sau 3 giờ/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đọc một bài' })).toHaveAttribute('href', '/read');
    expect(screen.getByRole('link', { name: 'Nghe một bài' })).toHaveAttribute('href', '/listen');
  });

  it('lists the word book with status badges, filters and remove with confirm', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    const list = await screen.findByRole('list', { name: 'Danh sách từ đã lưu' });
    expect(within(list).getByText('điều hành')).toBeInTheDocument();
    expect(within(list).getByText('Đang ôn')).toBeInTheDocument();
    expect(within(list).getByText('Mới')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mới' }));
    await waitFor(() => expect(within(list).queryByText('run')).toBeNull());
    expect(calls.some((c) => c.url === '/api/vocab?source=all&status=new')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Mới' }));
    expect(await within(list).findByText('run')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xóa run khỏi sổ từ' }));
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Xóa run khỏi sổ từ' }));
    // The confirm button replaces the × button and has the same name.
    const confirm = screen.getByRole('group', { name: 'Xóa run?' });
    await user.click(within(confirm).getByRole('button', { name: 'Xóa run khỏi sổ từ' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/vocab/1'));
  });
});

describe('VocabPage accessibility', () => {
  it('has a page title and no axe violations (front and back of the card)', async () => {
    const user = userEvent.setup();
    renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    expect(document.title).toBe('Ôn từ vựng · DailyLearning');
    await expectNoAxeViolations();
    await user.click(screen.getByRole('button', { name: 'Xem nghĩa' }));
    await expectNoAxeViolations();
  });
});

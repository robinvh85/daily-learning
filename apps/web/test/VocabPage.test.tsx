import type {
  DueReviewsResponse,
  PostponeResponse,
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

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

/** Previews of a weak card (new word): Nhớ is 1 day away, so there is no "Mai ôn". */
const weakPreviews = () => [
  { rating: 1 as const, due: inMs(10 * MIN), interval: '10 phút' },
  { rating: 2 as const, due: inMs(15 * MIN), interval: '15 phút' },
  { rating: 3 as const, due: inMs(DAY), interval: '1 ngày' },
  { rating: 4 as const, due: inMs(3 * DAY), interval: '3 ngày' },
];
/** Previews of a word already reviewed: Nhớ is days away, "Mai ôn" shows. */
const reviewedPreviews = () => [
  { rating: 1 as const, due: inMs(10 * MIN), interval: '10 phút' },
  { rating: 2 as const, due: inMs(2 * DAY), interval: '2 ngày' },
  { rating: 3 as const, due: inMs(3 * DAY), interval: '3 ngày' },
  { rating: 4 as const, due: inMs(5 * DAY), interval: '5 ngày' },
];

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
  exampleAudio: null,
  sourceLesson: { id: 1, slug: 'a-new-coffee-shop', kind: 'reading', title: 'A New Coffee Shop' },
  audioUrl: null,
  status: 'new',
  due: '2026-10-24T02:00:00.000Z',
  previews: weakPreviews(),
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
    {
      wordId: 3,
      lemma: 'owner',
      meaningVi: 'chủ',
      status: 'known',
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
    const picked = url.match(/^\/api\/reviews\/card\/(\d+)$/);
    if (picked) {
      const wordId = Number(picked[1]);
      const it = book.items.find((i) => i.wordId === wordId)!;
      return json({ card: card(wordId, it.lemma, { status: it.status }) });
    }
    const postpone = url.match(/^\/api\/reviews\/(\d+)\/postpone$/);
    if (postpone && method === 'POST') {
      const wordId = Number(postpone[1]);
      current = {
        ...current,
        cards: current.cards.filter((c) => c.wordId !== wordId),
        counts: { ...current.counts, due: current.counts.due - 1 },
      };
      const res: PostponeResponse = {
        wordId,
        due: '2026-10-24T17:00:00.000Z',
        counts: current.counts,
      };
      return json(res);
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
    ).toEqual(['Quên10 phút', 'Khó15 phút', 'Nhớ1 ngày', 'Dễ3 ngày']);
    expect(group).toHaveFocus();
  });

  it('adds "Mai ôn" between Khó and Nhớ when Nhớ is more than a day away', async () => {
    const user = userEvent.setup();
    renderPage({
      due: {
        ...twoCards,
        cards: [card(1, 'run', { status: 'learning', previews: reviewedPreviews() })],
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Xem nghĩa' }));
    const group = screen.getByRole('group', { name: 'Bạn nhớ từ này thế nào?' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Quên10 phút', 'Khó2 ngày', 'Mai ônngày mai', 'Nhớ3 ngày', 'Dễ5 ngày']);
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
    // Nhớ is only a day away, so no "Mai ôn": key 3 is the 3rd button, "Nhớ"; key 5 does nothing.
    await user.keyboard('5');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
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

  it('postpones the card to tomorrow with "Mai ôn" (key 3), without a rating', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({
      due: {
        ...twoCards,
        cards: [
          card(1, 'run', { status: 'learning', previews: reviewedPreviews() }),
          card(2, 'platform'),
        ],
      },
    });
    await screen.findByRole('heading', { name: 'run' });
    await user.keyboard(' ');
    expect(
      screen.getByRole('button', { name: 'Mai ôn: ôn lại vào ngày mai (phím 3)' }),
    ).toBeInTheDocument();
    await user.keyboard('3');
    expect(await screen.findByRole('heading', { name: 'platform' })).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toEqual([{ method: 'POST', url: '/api/reviews/1/postpone', body: undefined }]);
    // Postponing is not a review: "Đã ôn" stays at 3.
    expect(await screen.findByText('3 / 4')).toBeInTheDocument();
  });

  it('skips to another card with "Từ khác" and N / →, cycling through the queue', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    await user.click(screen.getByRole('button', { name: 'Từ khác N' }));
    expect(screen.getByRole('heading', { name: 'platform' })).toBeInTheDocument();
    await user.keyboard('n');
    expect(screen.getByRole('heading', { name: 'run' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { name: 'platform' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('has no skip button with a single due card', async () => {
    renderPage({ due: { ...twoCards, cards: [card(1, 'run')], counts: { due: 1, doneToday: 0 } } });
    await screen.findByRole('heading', { name: 'run' });
    expect(screen.queryByRole('button', { name: /Từ khác/ })).toBeNull();
  });

  it('reviews a word picked in the word book, then goes back to the queue', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    // "owner" is not due: its card is fetched on its own.
    await user.click(await screen.findByRole('button', { name: 'Ôn từ owner: chủ' }));
    expect(await screen.findByRole('heading', { name: 'owner' })).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/reviews/card/3')).toBe(true);
    expect(screen.getByText('Đang ôn từ bạn chọn trong sổ từ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem nghĩa' })).toHaveFocus();
    const row = screen.getByRole('button', { name: 'Ôn từ owner: chủ' }).closest('li')!;
    expect(row).toHaveAttribute('aria-current', 'true');

    await user.keyboard(' ');
    await user.keyboard('4');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        url: '/api/reviews/3',
        body: { rating: 4 },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'run' })).toBeInTheDocument();
  });

  it('picks a due word straight from the queue, and N goes back to the queue', async () => {
    const user = userEvent.setup();
    const { calls } = renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    await user.click(await screen.findByRole('button', { name: 'Ôn từ platform: sân ga' }));
    expect(screen.getByRole('heading', { name: 'platform' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.startsWith('/api/reviews/card/'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Về thẻ đến hạn N' }));
    expect(screen.getByRole('heading', { name: 'run' })).toBeInTheDocument();
  });

  it('plays the word with R and the example sentence with S', async () => {
    const stub = installMediaStub();
    try {
      const user = userEvent.setup();
      const url = '/content/lessons/a2/a-new-coffee-shop/audio.mp3?v=abc';
      renderPage({
        due: {
          ...twoCards,
          cards: [
            card(1, 'run', {
              audioUrl: '/content/words/run.mp3?v=1',
              exampleAudio: { url, startMs: 10560, endMs: 15888 },
            }),
          ],
        },
      });
      await screen.findByRole('heading', { name: 'run' });
      await user.keyboard('r');
      expect(stub.play).toHaveBeenCalledTimes(1);
      expect(lastPlayer().getAttribute('src')).toBe('/content/words/run.mp3?v=1');
      await user.keyboard('S');
      expect(stub.play).toHaveBeenCalledTimes(2);
      expect(lastPlayer().getAttribute('src')).toBe(url);
      expect(lastPlayer().currentTime).toBeCloseTo(10.56);
    } finally {
      stub.restore();
    }
  });

  it('opens the shortcuts list from the keyboard icon or ?, and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    const icon = screen.getByRole('button', { name: 'Phím tắt' });
    expect(icon).toHaveAttribute('aria-expanded', 'false');
    await user.click(icon);
    const dialog = screen.getByRole('dialog', { name: 'Phím tắt khi ôn từ' });
    expect(icon).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['Nghe lại từ', 'Nghe câu ví dụ', 'Sang từ khác (từ này ôn sau)'])
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(icon).toHaveFocus();

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Phím tắt khi ôn từ' })).toBeInTheDocument();
    await user.click(screen.getByRole('heading', { name: 'run' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('plays the example sentence from the lesson audio and stops at its end', async () => {
    const stub = installMediaStub();
    try {
      const url = '/content/lessons/a2/a-new-coffee-shop/audio.mp3?v=abc';
      renderPage({
        due: {
          ...twoCards,
          cards: [card(1, 'run', { exampleAudio: { url, startMs: 10560, endMs: 15888 } })],
        },
      });
      const btn = await screen.findByRole('button', { name: 'Nghe câu ví dụ' });
      await userEvent.setup().click(btn);
      expect(stub.play).toHaveBeenCalledTimes(1);
      const audio = lastPlayer();
      expect(audio.getAttribute('src')).toBe(url);
      expect(audio.currentTime).toBeCloseTo(10.56);
      expect(audio.paused).toBe(false);
      audio.currentTime = 15.9;
      audio.dispatchEvent(new Event('timeupdate'));
      expect(audio.paused).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it('has no example audio button when the example is not from a lesson', async () => {
    renderPage({ due: twoCards });
    await screen.findByRole('heading', { name: 'run' });
    expect(screen.queryByRole('button', { name: 'Nghe câu ví dụ' })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Phím tắt' }));
    await expectNoAxeViolations();
  });
});

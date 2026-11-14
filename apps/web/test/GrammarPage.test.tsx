import type { GrammarDetailResponse, GrammarListResponse } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrammarLibraryPage } from '../src/pages/Grammar/GrammarLibraryPage';
import { GrammarPage } from '../src/pages/Grammar/GrammarPage';
import { expectNoAxeViolations } from './axe';

const summary = {
  id: 1,
  slug: 'past-simple-regular',
  title: 'Quá khứ đơn – động từ có quy tắc',
  titleEn: 'Past simple (regular verbs)',
  level: 'A2' as const,
  group: 'tenses' as const,
  summary: 'Việc đã xong trong quá khứ.',
  draft: true,
  exerciseCount: 4,
  days: [2],
  progress: null,
};

const detail: GrammarDetailResponse = {
  point: summary,
  discover: {
    question: 'Các động từ tô đậm có gì chung?',
    answer: 'Đều thêm -ed.',
    examples: [
      {
        source: 'day',
        lessonSlug: 'my-first-week-at-a-new-job',
        lessonKind: 'reading',
        lessonTitle: 'My First Week at a New Job',
        segmentKey: 'p2s1',
        textEn: 'My manager showed me my desk.',
        textVi: 'Quản lý chỉ bàn cho tôi.',
        ranges: [[11, 17]],
        notes: [],
      },
    ],
  },
  form: [{ label: 'Khẳng định', pattern: 'S + V-ed', example: 'She worked.' }],
  usage: ['Việc đã xong.'],
  signals: ['yesterday'],
  spelling: ['try → tried'],
  mistakes: [{ wrong: 'Did she worked?', right: 'Did she work?', why: 'Sau did dùng nguyên mẫu.' }],
  exercises: [
    { type: 'choice', id: 11, idx: 0, prompt: 'We ___ home.', options: ['walk', 'walked'] },
    { type: 'gap', id: 12, idx: 1, prompt: 'She ___ (try) it.' },
    { type: 'order', id: 13, idx: 2, words: ['call', 'you', 'did'] },
    { type: 'find_error', id: 14, idx: 3, sentence: 'I watch it yesterday.' },
  ],
};

const ANSWERS: Record<
  number,
  { ok: (b: { value: unknown; correction?: string }) => boolean; expected: string }
> = {
  11: { ok: (b) => b.value === 1, expected: 'walked' },
  12: { ok: (b) => b.value === 'tried', expected: 'tried' },
  13: { ok: (b) => b.value === 'did you call', expected: 'Did you call?' },
  14: { ok: (b) => b.value === 'watch' && b.correction === 'watched', expected: 'watch → watched' },
};

let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const json = (data: unknown) => new Response(JSON.stringify(data));
      if (url === '/api/grammar') {
        const list: GrammarListResponse = {
          points: [
            summary,
            {
              ...summary,
              id: 2,
              slug: 'past-simple-irregular',
              title: 'Quá khứ đơn – bất quy tắc',
              days: [6],
              draft: false,
              progress: { status: 'completed', step: 2, score: 0.75, completedAt: null },
            },
          ],
        };
        return json(list);
      }
      if (url === '/api/grammar/past-simple-regular') return json(detail);
      if (url.endsWith('/answers')) {
        const a = ANSWERS[body.exerciseId as number]!;
        return json({
          correct: a.ok(body),
          expected: a.expected,
          explain: `Giải thích ${body.exerciseId}`,
        });
      }
      if (url.endsWith('/progress')) {
        return json({
          progress: {
            status: body.status ?? 'in_progress',
            step: body.step,
            score: null,
            completedAt: null,
          },
        });
      }
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/grammar" element={<GrammarLibraryPage />} />
          <Route path="/grammar/:slug" element={<GrammarPage />} />
          <Route path="/" element={<p>Trang chủ</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const progressCalls = () => calls.filter((c) => c.url.endsWith('/progress')).map((c) => c.body);

describe('GrammarLibraryPage', () => {
  it('lists the points by level with their status', async () => {
    const { container } = renderAt('/grammar');
    expect(await screen.findByText('Đã học 1/2 điểm ngữ pháp')).toBeTruthy();
    const regular = screen.getByRole('link', { name: /Quá khứ đơn – động từ có quy tắc/ });
    expect(regular.getAttribute('href')).toBe('/grammar/past-simple-regular');
    expect(within(regular).getByText('Chưa học')).toBeTruthy();
    expect(within(regular).getByText(/Ngày 2 · 4 bài tập · bản nháp/)).toBeTruthy();
    const irregular = screen.getByRole('link', { name: /bất quy tắc/ });
    expect(within(irregular).getByText('Đã học · 75%')).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe('GrammarPage', () => {
  it('shows the lesson sentences with the marked words, then the answer', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/grammar/past-simple-regular');
    await screen.findByRole('heading', { name: 'Quá khứ đơn – động từ có quy tắc' });
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('showed');
    expect(
      screen.getByRole('link', { name: /My First Week at a New Job/ }).getAttribute('href'),
    ).toBe('/read/my-first-week-at-a-new-job');
    expect(screen.queryByText('Đều thêm -ed.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Xem đáp án' }));
    expect(screen.getByText('Đều thêm -ed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /3\. Luyện tập/ })).toHaveProperty('disabled', true);
    await expectNoAxeViolations(container);
  });

  it('goes through the rules and saves the steps', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/grammar/past-simple-regular');
    await user.click(await screen.findByRole('button', { name: 'Tiếp: Quy tắc' }));
    expect(screen.getByRole('cell', { name: 'S + V-ed' })).toBeTruthy();
    expect(screen.getByText('Did she worked?')).toBeTruthy();
    expect(progressCalls()).toEqual([{ step: 1 }]);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Tiếp: Luyện tập' }));
    expect(screen.getByRole('heading', { name: 'Luyện tập' })).toBeTruthy();
    expect(progressCalls()).toEqual([{ step: 1 }, { step: 2 }]);
    // Going back to an earlier step does not save anything.
    await user.click(screen.getByRole('button', { name: /1\. Nhận ra/ }));
    expect(progressCalls()).toHaveLength(2);
  });

  it('checks every exercise type and completes the point with the score', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/grammar/past-simple-regular');
    await user.click(await screen.findByRole('button', { name: 'Tiếp: Quy tắc' }));
    await user.click(screen.getByRole('button', { name: 'Tiếp: Luyện tập' }));

    // Choice: wrong answer, shows the expected one; the options lock.
    const ex1 = screen.getByTestId('exercise-1');
    await user.click(within(ex1).getByRole('button', { name: 'walk' }));
    expect(await within(ex1).findByText('Chưa đúng.', { exact: false })).toBeTruthy();
    expect(within(ex1).getByText('walked', { selector: 'strong' })).toBeTruthy();
    expect(within(ex1).getByRole('button', { name: 'walked' })).toHaveProperty('disabled', true);

    // Gap.
    const ex2 = screen.getByTestId('exercise-2');
    await user.type(within(ex2).getByRole('textbox', { name: 'Câu trả lời' }), 'tried');
    await user.click(within(ex2).getByRole('button', { name: 'Kiểm tra' }));
    expect(await within(ex2).findByText('Đúng.')).toBeTruthy();
    expect(within(ex2).getByText('Giải thích 12')).toBeTruthy();

    // Order: check is enabled only when every word is used; "Xếp lại" starts over.
    const ex3 = screen.getByTestId('exercise-3');
    const check3 = within(ex3).getByRole('button', { name: 'Kiểm tra' });
    await user.click(within(ex3).getByRole('button', { name: 'you' }));
    expect(check3).toHaveProperty('disabled', true);
    await user.click(within(ex3).getByRole('button', { name: 'Xếp lại' }));
    for (const w of ['did', 'you', 'call'])
      await user.click(within(ex3).getByRole('button', { name: w }));
    await user.click(check3);
    expect(await within(ex3).findByText('Đúng.')).toBeTruthy();

    // Find the mistake: pick the word, then type the correction.
    const ex4 = screen.getByTestId('exercise-4');
    await user.click(within(ex4).getByRole('button', { name: 'watch' }));
    await user.type(within(ex4).getByRole('textbox'), 'watched');
    await user.click(within(ex4).getByRole('button', { name: 'Kiểm tra' }));
    expect(await within(ex4).findByText('Đúng.')).toBeTruthy();

    expect(screen.getByText('Xong! Đúng 3/4 câu.')).toBeTruthy();
    expect(progressCalls().at(-1)).toEqual({ step: 2, status: 'completed', score: 0.75 });
    const answers = calls.filter((c) => c.url.endsWith('/answers')).map((c) => c.body);
    expect(answers).toEqual([
      { exerciseId: 11, value: 0 },
      { exerciseId: 12, value: 'tried' },
      { exerciseId: 13, value: 'did you call' },
      { exerciseId: 14, value: 'watch', correction: 'watched' },
    ]);
    await expectNoAxeViolations(container);

    // "Làm lại" clears the answers.
    await user.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(screen.queryByText('Xong!', { exact: false })).toBeNull();
    expect(
      within(screen.getByTestId('exercise-1')).getByRole('button', { name: 'walk' }),
    ).toHaveProperty('disabled', false);
  });

  it('says when the point does not exist', async () => {
    renderAt('/grammar/nope');
    expect(await screen.findByText('Không tìm thấy điểm ngữ pháp này.')).toBeTruthy();
  });
});

import type { LessonDetailResponse } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_SIZE_KEY, ReadingPage } from '../src/pages/Reading/ReadingPage';
import { runWord, sentence, tokens } from './fixtures';
import { installMediaStub, lastPlayer } from './media';
import { expectNoAxeViolations } from './axe';

const simpleWord = (id: number, lemma: string, vi: string) => ({
  id,
  lemma,
  ipaUs: '/x/',
  cefr: 'A1' as const,
  isPhrase: false,
  status: 'reviewed' as const,
  audioUrl: null,
  senses: [
    {
      id: id * 10,
      key: 'main',
      pos: 'noun',
      meaningVi: vi,
      definitionEn: '-',
      collocations: [],
      example: `${lemma}.`,
    },
  ],
});

const baseLesson: LessonDetailResponse = {
  lesson: {
    id: 1,
    slug: 'a-new-coffee-shop',
    kind: 'reading',
    level: 'A2',
    title: 'A New Coffee Shop',
    topic: 'daily-life',
    wordCount: 7,
    durationMs: null,
    audioUrl: null,
    orderIndex: 1,
    progress: null,
  },
  segments: [
    {
      id: 11,
      key: 'p1s1',
      idx: 0,
      paragraphIdx: 0,
      speaker: null,
      textEn: sentence,
      textVi: 'Cô ấy muốn tự kinh doanh.',
      startMs: null,
      endMs: null,
      tokens,
    },
  ],
  words: {
    1: simpleWord(1, 'she', 'cô ấy'),
    2: simpleWord(2, 'want', 'muốn'),
    7: runWord,
    9: simpleWord(9, 'business', 'việc kinh doanh'),
  },
  focusWords: [
    { wordId: 7, senseId: 71 },
    { wordId: 9, senseId: 90 },
  ],
  questions: [
    {
      id: 5,
      idx: 0,
      prompt: 'What does she want?',
      options: ['A job', 'Her own business'],
      evidenceSegmentId: 11,
    },
  ],
  dictation: [],
  peaks: null,
};

let lesson: LessonDetailResponse;
let saved: number[];
let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  lesson = baseLesson;
  saved = [];
  calls = [];
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const json = (data: unknown) => new Response(JSON.stringify(data));
      if (url === '/api/lessons/a-new-coffee-shop') return json(lesson);
      if (url.startsWith('/api/vocab/saved')) return json({ wordIds: saved });
      if (url.startsWith('/api/vocab/')) {
        const id = Number(url.split('/').pop());
        saved = method === 'POST' ? [...saved, id] : saved.filter((x) => x !== id);
        return json({ wordId: id, senseId: null, saved: method === 'POST' });
      }
      if (url.endsWith('/answers')) {
        const correct = body.value === 1;
        return json({ correct, feedback: correct ? 'Đúng rồi' : 'Chưa đúng' });
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/a-new-coffee-shop']}>
        <Routes>
          <Route path="/read/:slug" element={<ReadingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReadingPage', () => {
  it('opens the first focus word and selects any word from the text', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Từ đang chọn' });
    expect(within(card).getByRole('heading', { name: 'run' })).toBeInTheDocument();
    expect(within(card).getByText('điều hành, quản lý (cửa hàng, công ty)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Từ mới trong bài (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'She' }));
    expect(within(card).getByRole('heading', { name: 'she' })).toBeInTheDocument();
    expect(within(card).getByText('cô ấy')).toBeInTheDocument();
  });

  it('toggles the translation and remembers the font size', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'A New Coffee Shop' });
    expect(screen.queryByText('Cô ấy muốn tự kinh doanh.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Song ngữ' }));
    expect(screen.getByText('Cô ấy muốn tự kinh doanh.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tăng cỡ chữ' }));
    expect(screen.getByTestId('reading-text')).toHaveStyle({ fontSize: '20px' });
    expect(window.localStorage.getItem(FONT_SIZE_KEY)).toBe('20');
    expect(screen.getByRole('button', { name: /Nghe bài đọc/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('saves the selected word through the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Lưu vào sổ từ để ôn' }));
    expect(await screen.findByRole('button', { name: 'Đã lưu vào sổ từ' })).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: '/api/vocab/7',
      method: 'POST',
      body: { senseId: 71, sourceLessonId: 1 },
    });
  });

  it('grades quiz answers on the server and completes the lesson', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('1 câu · chọn một đáp án')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'A job' }));
    expect(await screen.findByText('Chưa đúng')).toBeInTheDocument();
    expect(screen.getByText('Đúng 0/1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Her own business' }));
    expect(await screen.findByText('Đúng rồi')).toBeInTheDocument();
    expect(screen.getByText('Đúng 1/1')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/progress')).at(-1)?.body).toEqual({
      step: 2,
      status: 'completed',
      score: 1,
    });
  });
});

describe('ReadingPage with narrator audio', () => {
  let stub: ReturnType<typeof installMediaStub>;
  beforeEach(() => {
    stub = installMediaStub();
    lesson = {
      ...baseLesson,
      lesson: { ...baseLesson.lesson, audioUrl: '/content/x/audio.mp3?v=1', durationMs: 3000 },
      segments: baseLesson.segments.map((s) => ({ ...s, startMs: 0, endMs: 2500 })),
      peaks: [0.5, 1],
    };
  });
  afterEach(() => {
    cleanup();
    stub.restore();
  });

  it('plays "Nghe bài đọc" and highlights the sentence being read', async () => {
    const user = userEvent.setup();
    renderPage();
    const listen = await screen.findByRole('button', { name: 'Nghe bài đọc' });
    expect(listen).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('sentence-p1s1')).not.toHaveAttribute('aria-current');
    await user.click(listen);
    expect(lastPlayer().getAttribute('src')).toBe('/content/x/audio.mp3?v=1');
    expect(lastPlayer().paused).toBe(false);
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('sentence-p1s1')).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(lastPlayer().paused).toBe(true);
  });

  it('jumps to the previous / next sentence', async () => {
    const user = userEvent.setup();
    const first = baseLesson.segments[0]!;
    lesson = {
      ...lesson,
      segments: [
        { ...first, startMs: 0, endMs: 1400 },
        { ...first, id: 12, key: 'p1s2', idx: 1, startMs: 1500, endMs: 2900 },
      ],
    };
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Nghe bài đọc' }));
    expect(screen.getByTestId('sentence-p1s1')).toHaveAttribute('aria-current', 'true');

    const next = screen.getByRole('button', { name: 'Câu sau' });
    await user.click(next);
    expect(lastPlayer().currentTime).toBe(1.5);
    expect(lastPlayer().paused).toBe(false);
    expect(screen.getByTestId('sentence-p1s2')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('sentence-p1s1')).not.toHaveAttribute('aria-current');
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Câu trước' }));
    expect(lastPlayer().currentTime).toBe(0);
    expect(screen.getByTestId('sentence-p1s1')).toHaveAttribute('aria-current', 'true');
    expect(next).toBeEnabled();
  });

  it('hides sentence navigation when the audio has no timings', async () => {
    lesson = { ...lesson, segments: baseLesson.segments };
    renderPage();
    await screen.findByRole('button', { name: 'Nghe bài đọc' });
    expect(screen.queryByRole('button', { name: 'Câu sau' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Câu trước' })).toBeNull();
  });
});

describe('ReadingPage accessibility', () => {
  it('has a page title and no axe violations', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Từ đang chọn' });
    expect(document.title).toBe('A New Coffee Shop – Bài đọc · DailyLearning');
    await expectNoAxeViolations();
  });
});

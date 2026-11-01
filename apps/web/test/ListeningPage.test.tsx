import type { LessonDetailResponse, SegmentDto } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListeningPage } from '../src/pages/Listening/ListeningPage';
import { installMediaStub, lastPlayer } from './media';
import { expectNoAxeViolations } from './axe';

const word = (id: number, lemma: string, vi: string, audioUrl: string | null = null) => ({
  id,
  lemma,
  ipaUs: '/x/',
  cefr: 'A2' as const,
  isPhrase: false,
  status: 'reviewed' as const,
  audioUrl,
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

const seg = (
  id: number,
  key: string,
  speaker: 'A' | 'B',
  textEn: string,
  textVi: string,
  startMs: number | null,
  endMs: number | null,
  tokens: SegmentDto['tokens'] = [],
): SegmentDto => ({
  id,
  key,
  idx: id - 1,
  paragraphIdx: null,
  speaker,
  textEn,
  textVi,
  startMs,
  endMs,
  tokens,
});

function makeLesson(withAudio: boolean): LessonDetailResponse {
  const t = (a: number, b: number) => (withAudio ? [a, b] : [null, null]) as [number, number];
  return {
    lesson: {
      id: 2,
      slug: 'at-the-train-station',
      kind: 'listening',
      level: 'A2',
      title: 'At the Train Station',
      topic: 'travel',
      wordCount: 20,
      durationMs: withAudio ? 9000 : null,
      audioUrl: withAudio ? '/content/lessons/a2/at-the-train-station/audio.mp3?v=abc' : null,
      orderIndex: 1,
      progress: null,
    },
    segments: [
      seg(1, 'l1', 'A', 'Which platform?', 'Sân ga nào?', ...t(0, 2000), [
        { idx: 0, surface: 'platform', start: 6, end: 14, wordId: 5, senseId: 50 },
      ]),
      // Ends after 5 s: the waveform's 5 s step must land inside l2, not on its end, or the
      // segment loop may jump back to 2.4 s before the assertion.
      seg(2, 'l2', 'B', 'It is late.', 'Tàu trễ.', ...t(2400, 5200)),
      seg(3, 'l3', 'A', 'Every station.', 'Mọi ga.', ...t(5400, 9000)),
    ],
    words: { 5: word(5, 'platform', 'sân ga', '/content/words/platform.mp3?v=1') },
    focusWords: [{ wordId: 5, senseId: 50 }],
    questions: [
      { id: 7, idx: 0, prompt: 'Is it late?', options: ['Yes', 'No'], evidenceSegmentId: 2 },
    ],
    dictation: [
      { id: 21, idx: 0, segmentId: 2, beforeText: 'It is', afterText: '.' },
      { id: 22, idx: 1, segmentId: 3, beforeText: 'Every', afterText: '.' },
    ],
    peaks: withAudio ? [0.2, 0.5, 1, 0.4, 0.6, 0.3, 0.8, 0.1, 0.9, 0.5] : null,
  };
}

let lesson: LessonDetailResponse;
let calls: { url: string; method: string; body: unknown }[];
let stub: ReturnType<typeof installMediaStub>;

beforeEach(() => {
  calls = [];
  stub = installMediaStub();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const json = (data: unknown) => new Response(JSON.stringify(data));
      if (url === '/api/lessons/at-the-train-station') return json(lesson);
      if (url.startsWith('/api/vocab/saved')) return json({ wordIds: [] });
      if (url.endsWith('/answers')) {
        if ('questionId' in body)
          return json({ correct: body.value === 0, feedback: null, expected: null });
        const expected = body.dictationItemId === 21 ? 'late' : 'station';
        const correct = body.value.toLowerCase() === expected;
        return json({ correct, feedback: null, expected: correct ? null : expected });
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
  stub.restore();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/listen/at-the-train-station']}>
        <Routes>
          <Route path="/listen/:slug" element={<ListeningPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListeningPage without audio', () => {
  beforeEach(() => {
    lesson = makeLesson(false);
  });

  it('explains how to generate audio and keeps the transcript and exercises usable', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Bài này chưa có audio' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/npm run content:tts -- at-the-train-station/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Trình phát' })).toBeNull();
    expect(screen.getByText('Hội thoại · giọng Anh-Mỹ')).toBeInTheDocument();

    // Transcript hidden by default.
    expect(screen.getByText('Lời thoại đang ẩn')).toBeInTheDocument();
    expect(screen.queryByText('It is late.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hiện lời thoại' }));
    expect(screen.getByText('It is late.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nghe từ/ })).toBeNull();

    // Bilingual toggle.
    expect(screen.queryByText('Tàu trễ.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Song ngữ' }));
    expect(screen.getByText('Tàu trễ.')).toBeInTheDocument();

    // Words open the WordCard, with the pronunciation button enabled when the word has audio.
    await user.click(screen.getByRole('button', { name: 'platform' }));
    const card = screen.getByRole('region', { name: 'Từ đang chọn' });
    expect(within(card).getByText('sân ga')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Nghe phát âm platform' }));
    expect(stub.play).toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Đóng thẻ từ' }));
    expect(screen.queryByRole('region', { name: 'Từ đang chọn' })).toBeNull();

    // Dictation works without audio (no "Nghe câu này").
    expect(screen.queryByRole('button', { name: /Nghe câu này/ })).toBeNull();
  });

  it('grades dictation on the server, shows the answer when wrong and completes the lesson', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('It is ____ .'), 'LATE');
    await user.type(screen.getByLabelText('Every ____ .'), 'stations');
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(await screen.findByText(/Đúng 1\/2/)).toBeInTheDocument();
    expect(screen.getByText('station')).toBeInTheDocument();
    expect(screen.getByLabelText('Every ____ .')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.filter((c) => c.url.endsWith('/answers')).map((c) => c.body)).toEqual([
      { dictationItemId: 21, value: 'LATE' },
      { dictationItemId: 22, value: 'stations' },
    ]);
    expect(calls.filter((c) => c.url.endsWith('/progress')).at(-1)?.body).toEqual({ step: 1 });

    const quizTab = screen.getByRole('tab', { name: 'Nghe hiểu' });
    await user.click(quizTab);
    expect(quizTab).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await screen.findByText('Đúng 1/1');
    expect(calls.filter((c) => c.url.endsWith('/progress')).at(-1)?.body).toEqual({
      step: 2,
      status: 'completed',
      score: 2 / 3,
    });
  });
});

describe('ListeningPage with audio', () => {
  beforeEach(() => {
    lesson = makeLesson(true);
  });

  it('plays, seeks by segment, loops, changes speed and highlights the current line', async () => {
    const user = userEvent.setup();
    renderPage();
    const player = await screen.findByRole('region', { name: 'Trình phát' });
    expect(within(player).getAllByTestId('wave-bar')).toHaveLength(10);
    expect(within(player).getByText('0:09')).toBeInTheDocument();
    const audio = lastPlayer();
    expect(audio.getAttribute('src')).toBe(lesson.lesson.audioUrl);

    await user.click(within(player).getByRole('button', { name: 'Phát' }));
    expect(audio.paused).toBe(false);
    expect(within(player).getByRole('button', { name: 'Tạm dừng' })).toBeInTheDocument();

    await user.click(within(player).getByRole('button', { name: 'Câu sau' }));
    expect(audio.currentTime).toBe(2.4);
    await user.click(within(player).getByRole('button', { name: 'Câu sau' }));
    expect(audio.currentTime).toBe(5.4);
    await user.click(within(player).getByRole('button', { name: 'Câu trước' }));
    expect(audio.currentTime).toBe(2.4);

    await user.click(within(player).getByRole('button', { name: '0.75×' }));
    expect(audio.playbackRate).toBe(0.75);
    expect(within(player).getByRole('button', { name: '0.75×' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const loop = within(player).getByRole('button', { name: 'Lặp câu' });
    await user.click(loop);
    expect(loop).toHaveAttribute('aria-pressed', 'true');

    // Transcript: current line highlighted; time buttons and rows seek.
    await user.click(screen.getByRole('button', { name: 'Hiện lời thoại' }));
    expect(screen.getByTestId('line-l2')).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Nghe từ 0:05' }));
    expect(audio.currentTime).toBe(5.4);
    expect(screen.getByTestId('line-l3')).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByTestId('line-l1'));
    expect(audio.currentTime).toBe(0);
    // Clicking a word opens the card and does not seek.
    audio.currentTime = 6;
    await user.click(screen.getByRole('button', { name: 'platform' }));
    expect(audio.currentTime).toBe(6);

    // Waveform: keyboard and click seek.
    const wave = within(player).getByRole('slider', { name: 'Vị trí phát' });
    act(() => wave.focus());
    await user.keyboard('{Home}');
    expect(audio.currentTime).toBe(0);
    await user.keyboard('{ArrowRight}');
    expect(audio.currentTime).toBe(5);
    await user.click(within(player).getAllByTestId('wave-bar')[5]!);
    expect(audio.currentTime).toBe(4.5);
  });

  it('controls playback from the keyboard: Space, ← and →', async () => {
    const user = userEvent.setup();
    renderPage();
    const player = await screen.findByRole('region', { name: 'Trình phát' });
    expect(within(player).getByText(/Phím tắt:/)).toBeInTheDocument();
    const audio = lastPlayer();

    await user.keyboard(' ');
    expect(audio.paused).toBe(false);
    await user.keyboard('{ArrowRight}');
    expect(audio.currentTime).toBe(2.4);
    await user.keyboard('{ArrowRight}');
    expect(audio.currentTime).toBe(5.4);
    await user.keyboard('{ArrowLeft}');
    expect(audio.currentTime).toBe(2.4);
    await user.keyboard(' ');
    expect(audio.paused).toBe(true);

    // After clicking a player button, Space plays / pauses instead of repeating that button.
    await user.click(within(player).getByRole('button', { name: 'Câu sau' }));
    expect(audio.currentTime).toBe(5.4);
    await user.keyboard(' ');
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(5.4);
    await user.keyboard(' ');
    expect(audio.paused).toBe(true);

    // The waveform slider keeps its own arrow keys (5 s steps), no sentence jump on top.
    const wave = within(player).getByRole('slider', { name: 'Vị trí phát' });
    act(() => wave.focus());
    await user.keyboard('{Home}{ArrowRight}');
    expect(audio.currentTime).toBe(5);

    // Typing the dictation answer: keys stay text input.
    const input = screen.getAllByRole('textbox')[0]!;
    await user.click(input);
    await user.keyboard('a b{ArrowLeft}');
    expect(input).toHaveValue('a b');
    expect(audio.paused).toBe(true);
    expect(audio.currentTime).toBe(5);

    // Modifier combos (browser back/forward, word jumps) are left alone.
    act(() => input.blur());
    await user.keyboard('{Meta>}{ArrowRight}{/Meta}');
    expect(audio.currentTime).toBe(5);
  });

  it('plays a single dictation segment', async () => {
    const user = userEvent.setup();
    renderPage();
    const buttons = await screen.findAllByRole('button', { name: /Nghe câu này/ });
    await user.click(buttons[1]!);
    const audio = lastPlayer();
    expect(audio.currentTime).toBe(5.4);
    expect(audio.paused).toBe(false);
  });
});

describe('ListeningPage accessibility', () => {
  beforeEach(() => {
    lesson = makeLesson(true);
  });

  it('has a page title and no axe violations (player, transcript, both tabs)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('region', { name: 'Trình phát' });
    expect(document.title).toMatch(/ – Bài nghe · DailyLearning$/);
    await user.click(screen.getByRole('button', { name: 'Hiện lời thoại' }));
    await expectNoAxeViolations();
    await user.click(screen.getByRole('tab', { name: 'Nghe hiểu' }));
    await expectNoAxeViolations();
  });
});

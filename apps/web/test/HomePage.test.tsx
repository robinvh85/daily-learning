import type {
  DashboardResponse,
  LessonListResponse,
  LessonSummary,
  TodayResponse,
} from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { formatMinutes, formatVnDate } from '../src/lib/date';
import { HomePage } from '../src/pages/Home/HomePage';
import { expectNoAxeViolations } from './axe';

const lesson = (id: number, kind: LessonSummary['kind'], extra: Partial<LessonSummary> = {}) =>
  ({
    id,
    slug: `lesson-${id}`,
    kind,
    level: 'A2',
    title: `Lesson ${id}`,
    topic: 'daily-life',
    wordCount: 240,
    durationMs: null,
    audioUrl: null,
    orderIndex: id,
    progress: null,
    ...extra,
  }) satisfies LessonSummary;

const reading = lesson(1, 'reading', {
  title: 'A New Coffee Shop',
  slug: 'a-new-coffee-shop',
  wordCount: 180,
  progress: { status: 'in_progress', step: 1, score: null, completedAt: null },
});
const listening = lesson(2, 'listening', {
  title: 'At the Train Station',
  slug: 'at-the-train-station',
  durationMs: 42_000,
});

const today: TodayResponse = {
  date: '2026-10-24',
  source: 'plan',
  day: 7,
  title: 'Cuộc sống quanh khu phố',
  steps: [
    {
      kind: 'reading',
      status: 'in_progress',
      progressPct: 33,
      minutes: 5,
      url: '/read/a-new-coffee-shop',
      lesson: reading,
      reviews: null,
      grammar: null,
    },
    {
      kind: 'listening',
      status: 'not_started',
      progressPct: 0,
      minutes: 6,
      url: '/listen/at-the-train-station',
      lesson: listening,
      reviews: null,
      grammar: null,
    },
    {
      kind: 'reviews',
      status: 'not_started',
      progressPct: 0,
      minutes: 4,
      url: '/vocab',
      lesson: null,
      reviews: { due: 18, doneToday: 0 },
      grammar: null,
    },
  ],
  estimatedMinutes: 15,
  grammarBacklog: 0,
  continueUrl: '/read/a-new-coffee-shop',
  allDone: false,
};

const dashboard: DashboardResponse = {
  displayName: 'Viet',
  level: 'A2',
  date: '2026-10-24',
  streak: { days: 12, activeToday: true },
  path: { level: 'A2', completed: 7, total: 20, percent: 35 },
  words: { remembered: 214, known: 142, learning: 72, oxford3000: 168 },
  week: {
    totalMinutes: 92,
    dailyGoalMin: 15,
    days: [10, 21, 18, 6, 21, 19, 0].map((minutes, i) => ({
      date: `2026-10-${19 + i}`,
      minutes,
    })),
  },
};

const libraries: Record<string, LessonListResponse> = {
  reading: {
    lessons: [
      reading,
      lesson(3, 'reading', { title: 'Ordering Food by Phone', wordCount: 480 }),
      lesson(4, 'reading', { title: 'Weekend Plans', level: 'A2+' }),
    ],
  },
  listening: {
    lessons: [
      listening,
      lesson(5, 'listening', { title: 'Asking for Directions', durationMs: 80_000 }),
    ],
  },
};

function renderHome(t: TodayResponse = today) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
      if (url === '/api/today') return json(t);
      if (url === '/api/dashboard') return json(dashboard);
      const kind = new URL(url, 'http://x').searchParams.get('kind');
      if (url.startsWith('/api/lessons') && kind) return json(libraries[kind]);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  it('greets the learner with the date, streak and level', async () => {
    renderHome();
    expect(
      await screen.findByRole('heading', { name: 'Chào Viet, hôm nay học 15 phút nhé' }),
    ).toBeInTheDocument();
    expect(screen.getByText(formatVnDate(new Date()))).toBeInTheDocument();
    expect(screen.getByText('Chuỗi 12 ngày')).toBeInTheDocument();
    expect(screen.getByText('Trình độ: A2')).toBeInTheDocument();
  });

  it("shows today's lesson with 3 steps and continues at the first unfinished one", async () => {
    renderHome();
    const card = await screen.findByRole('region', { name: 'Cuộc sống quanh khu phố' });
    expect(within(card).getByText('Bài học hôm nay · Bài 7')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Tiếp tục học' })).toHaveAttribute(
      'href',
      '/read/a-new-coffee-shop',
    );
    const steps = within(card).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    const [r, l, v] = steps.map((s) => within(s).getByRole('link'));
    expect(r).toHaveAttribute('aria-current', 'step');
    expect(r).toHaveTextContent('Đang học');
    expect(r).toHaveTextContent('180 từ · 5 phút');
    expect(l).toHaveTextContent('Chưa học');
    expect(l).toHaveTextContent('0:42 · 6 phút');
    expect(v).toHaveTextContent('18 từ đến hạn ôn');
    expect(v).toHaveAttribute('href', '/vocab');
  });

  it('shows a done state when every step is finished', async () => {
    renderHome({
      ...today,
      steps: today.steps.map((s) => ({ ...s, status: 'done', progressPct: 100 })),
      continueUrl: null,
      allDone: true,
      estimatedMinutes: 0,
    });
    expect(await screen.findByText(/Bạn đã hoàn thành bài hôm nay/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tiếp tục học' })).toBeNull();
    expect(screen.getAllByText('Đã xong')).toHaveLength(3);
  });

  it("shows the day's grammar step and the grammar points left from earlier days", async () => {
    const reviews = today.steps[2]!;
    renderHome({
      ...today,
      steps: [
        today.steps[0]!,
        today.steps[1]!,
        {
          kind: 'grammar',
          status: 'not_started',
          progressPct: 0,
          minutes: 6,
          url: '/grammar/past-simple-regular',
          lesson: null,
          reviews: null,
          grammar: {
            id: 1,
            slug: 'past-simple-regular',
            title: 'Quá khứ đơn – động từ có quy tắc',
            titleEn: 'Past simple (regular verbs)',
            level: 'A2',
            group: 'tenses',
            summary: '-',
            draft: false,
            exerciseCount: 8,
            days: [7],
            progress: null,
          },
        },
        reviews,
      ],
      grammarBacklog: 2,
    });
    const steps = await screen.findByRole('list', { name: 'Các bước hôm nay' });
    const g = within(steps).getByRole('link', { name: /3 · Ngữ pháp/ });
    expect(g).toHaveAttribute('href', '/grammar/past-simple-regular');
    expect(g).toHaveTextContent('Quá khứ đơn – động từ có quy tắc');
    expect(g).toHaveTextContent('8 bài tập · 6 phút');
    expect(within(steps).getByRole('link', { name: /4 · Ôn từ/ })).toBeInTheDocument();
    expect(screen.getByText(/Còn 2 điểm ngữ pháp của các ngày trước chưa học/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem thư viện ngữ pháp' })).toHaveAttribute(
      'href',
      '/grammar',
    );
  });

  it('shows path, words and an accessible week chart', async () => {
    renderHome();
    expect(await screen.findByText('Bài 7 / 20 của cấp A2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ cấp A2' })).toHaveAttribute(
      'aria-valuenow',
      '35',
    );
    expect(screen.getByText('Thuộc 142')).toBeInTheDocument();
    expect(screen.getByText('Đang ôn 72')).toBeInTheDocument();
    expect(screen.getByText('Trong Oxford 3000: 168')).toBeInTheDocument();
    expect(screen.getByText('1 giờ 32 phút')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: 'Thứ Hai 10' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: 'Chủ Nhật 0' })).toBeInTheDocument();
    // Days below the 15-minute goal use the light color.
    const bars = screen.getAllByTestId('week-bar');
    expect(bars.filter((b) => b.className.includes('barLow'))).toHaveLength(3);
  });

  it("lists other lessons in the libraries, not today's", async () => {
    renderHome();
    const read = await screen.findByRole('region', { name: 'Thư viện bài đọc' });
    expect(await within(read).findByText('Ordering Food by Phone')).toBeInTheDocument();
    expect(within(read).queryByText('A New Coffee Shop')).toBeNull();
    expect(within(read).getByText('A2 · 4 phút')).toBeInTheDocument();
    expect(within(read).getByRole('link', { name: 'Xem tất cả bài đọc' })).toHaveAttribute(
      'href',
      '/read',
    );
    const listen = screen.getByRole('region', { name: 'Thư viện bài nghe' });
    expect(await within(listen).findByText('A2 · 1:20')).toBeInTheDocument();
  });
});

describe('date helpers', () => {
  it('formats the Vietnamese date on the Ho Chi Minh calendar', () => {
    expect(formatVnDate(new Date('2026-10-24T02:00:00Z'))).toBe('Thứ Bảy, 24/10/2026');
    // 17:30 UTC on Saturday is already Sunday in Vietnam.
    expect(formatVnDate(new Date('2026-10-24T17:30:00Z'))).toBe('Chủ Nhật, 25/10/2026');
  });

  it('formats minutes', () => {
    expect(formatMinutes(92)).toBe('1 giờ 32 phút');
    expect(formatMinutes(45)).toBe('45 phút');
    expect(formatMinutes(120)).toBe('2 giờ');
  });
});

describe('HomePage accessibility', () => {
  it('has a page title and no axe violations', async () => {
    renderHome();
    await screen.findByRole('heading', { name: 'Chào Viet, hôm nay học 15 phút nhé' });
    expect(document.title).toBe('Trang chủ · DailyLearning');
    await expectNoAxeViolations();
  });
});

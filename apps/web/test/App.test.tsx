import type { MeResponse } from '@daily-learning/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

function renderApp(me: MeResponse, path = '/') {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(new Response(JSON.stringify(me)));
    if (url === '/api/lessons' || url.startsWith('/api/lessons?'))
      return Promise.resolve(new Response(JSON.stringify({ lessons: [] })));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('shows the sidebar and home page without login in AUTH_MODE=none', async () => {
    renderApp({ authMode: 'none', user: { id: 1, email: null } });
    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Từ vựng/ })).toHaveTextContent('0');
    expect(screen.getByText('Sắp có ở v2')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Đăng nhập' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
  });

  it('shows the login page in AUTH_MODE=password when logged out', async () => {
    renderApp({ authMode: 'password', user: null }, '/read/a-new-coffee-shop');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });

  it('routes listening lessons to the listening page', async () => {
    renderApp({ authMode: 'none', user: { id: 1, email: null } }, '/listen/at-the-train-station');
    expect(await screen.findByText('Không tìm thấy bài nghe này.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nghe' })).toHaveAttribute('aria-current', 'page');
  });
});

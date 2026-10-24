import type { HealthResponse } from '@daily-learning/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('shows the server status from /api/health', async () => {
    const body: HealthResponse = { status: 'ok', uptime: 42, time: new Date().toISOString() };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText('Đang kiểm tra kết nối…')).toBeInTheDocument();
    expect(await screen.findByText(/Máy chủ hoạt động bình thường/)).toHaveTextContent('42s');
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('shows an error when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 502');
  });
});

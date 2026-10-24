import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WordCard } from '../src/components/WordCard/WordCard';
import { runWord } from './fixtures';
import { installMediaStub, lastPlayer } from './media';

describe('WordCard', () => {
  it('shows the sense used in context with IPA, part of speech, example and collocations', () => {
    render(<WordCard word={runWord} senseId={71} surface="run" onToggleSave={() => {}} />);
    expect(screen.getByRole('heading', { name: 'run' })).toBeInTheDocument();
    expect(screen.getByText('/rʌn/')).toBeInTheDocument();
    expect(screen.getByText('động từ')).toBeInTheDocument();
    expect(screen.getByText('điều hành, quản lý (cửa hàng, công ty)')).toBeInTheDocument();
    expect(screen.queryByText('chạy')).toBeNull();
    expect(screen.getByText('“She wants to run her own business.”')).toBeInTheDocument();
    expect(screen.getByText('run a business, run a shop')).toBeInTheDocument();
    expect(screen.queryByText(/Trong bài/)).toBeNull();
  });

  it('falls back to the first sense and shows the form used in the text', () => {
    render(<WordCard word={runWord} senseId={null} surface="ran" />);
    expect(screen.getByText('chạy')).toBeInTheDocument();
    expect(screen.getByText(/Trong bài/)).toHaveTextContent('Trong bài: ran');
  });

  it('shows the draft badge, a disabled speaker and the Cambridge US link', () => {
    render(<WordCard word={runWord} senseId={71} />);
    expect(screen.getByText('bản nháp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nghe phát âm run/ })).toBeDisabled();
    const link = screen.getByRole('link', { name: /Tra Cambridge \(US\)/ });
    expect(link).toHaveAttribute(
      'href',
      'https://dictionary.cambridge.org/us/dictionary/english/run',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('plays the pronunciation when the word has audio', async () => {
    const stub = installMediaStub();
    try {
      render(<WordCard word={{ ...runWord, audioUrl: '/content/words/run.mp3?v=1' }} />);
      const btn = screen.getByRole('button', { name: 'Nghe phát âm run' });
      expect(btn).toBeEnabled();
      await userEvent.setup().click(btn);
      expect(stub.play).toHaveBeenCalledTimes(1);
      expect(lastPlayer().getAttribute('src')).toBe('/content/words/run.mp3?v=1');
    } finally {
      stub.restore();
    }
  });

  it('hides the draft badge for reviewed entries', () => {
    render(<WordCard word={{ ...runWord, status: 'reviewed' }} senseId={71} />);
    expect(screen.queryByText('bản nháp')).toBeNull();
  });

  it('toggles saving', async () => {
    const user = userEvent.setup();
    const onToggleSave = vi.fn();
    const { rerender } = render(
      <WordCard word={runWord} senseId={71} onToggleSave={onToggleSave} />,
    );
    const save = screen.getByRole('button', { name: 'Lưu vào sổ từ để ôn' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await user.click(save);
    expect(onToggleSave).toHaveBeenCalledOnce();

    rerender(<WordCard word={runWord} senseId={71} saved onToggleSave={onToggleSave} />);
    expect(screen.getByRole('button', { name: 'Đã lưu vào sổ từ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a hint when no word is selected', () => {
    render(<WordCard word={null} />);
    expect(screen.getByText(/Bấm vào một từ/)).toBeInTheDocument();
  });
});

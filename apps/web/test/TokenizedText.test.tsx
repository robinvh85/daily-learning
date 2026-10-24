import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TokenizedText } from '../src/components/TokenizedText/TokenizedText';
import { sentence, tokens } from './fixtures';

describe('TokenizedText', () => {
  it('renders the exact text with every token as a button', () => {
    const { container } = render(
      <p>
        <TokenizedText text={sentence} tokens={tokens} />
      </p>,
    );
    expect(container.textContent).toBe(sentence);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['She', 'wants', 'run', 'business']);
    // Untokenized text ("to", "her own", ".") stays plain text.
    expect(screen.queryByRole('button', { name: 'to' })).toBeNull();
  });

  it('marks focus words and the selected word', () => {
    render(
      <TokenizedText
        text={sentence}
        tokens={tokens}
        focusWordIds={new Set([7, 9])}
        selectedWordId={7}
      />,
    );
    const run = screen.getByRole('button', { name: 'run' });
    expect(run).toHaveAttribute('aria-pressed', 'true');
    expect(run.className).toMatch(/focus/);
    expect(run.className).toMatch(/selected/);
    expect(screen.getByRole('button', { name: 'business' }).className).toMatch(/focus/);
    expect(screen.getByRole('button', { name: 'She' }).className).not.toMatch(/focus/);
    expect(screen.getByRole('button', { name: 'She' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects a word by click and by keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TokenizedText text={sentence} tokens={tokens} onSelect={onSelect} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'She' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(tokens[0]);
    await user.tab();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith(tokens[1]);

    await user.click(screen.getByRole('button', { name: 'run' }));
    expect(onSelect).toHaveBeenLastCalledWith(tokens[2]);
  });
});

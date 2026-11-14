import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButtons } from './share-buttons';

const url = 'https://loja.test/compra-coletiva/grupo-demo?x=1&y=2';

describe('ShareButtons', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('link do WhatsApp leva o texto e a URL codificados', () => {
    render(<ShareButtons url={url} text="Entre no grupo" />);
    const link = screen.getByRole('link', { name: 'Compartilhar no WhatsApp' });
    expect(link.getAttribute('href')).toBe(
      'https://wa.me/?text=' + encodeURIComponent('Entre no grupo ' + url),
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('copia o link e volta ao rótulo original após 2 s', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ShareButtons url={url} text="x" />);
    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(screen.getByRole('button', { name: /Link copiado/ })).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeVisible();
  });

  it('falha em silêncio quando o clipboard não existe', async () => {
    const user = userEvent.setup();
    render(<ShareButtons url={url} text="x" />);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('negado'));
    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeVisible();
  });
});

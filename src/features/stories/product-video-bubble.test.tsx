import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoriesFeed, StoryVideoPublic } from '@maos-em-oracao/contracts';
import { BUBBLE_DISMISS_KEY, ProductVideoBubble } from './product-video-bubble';

vi.mock('./events', () => ({ useStoryTracker: () => vi.fn() }));
vi.mock('@/lib/api/query', () => ({ useCatalog: () => ({ data: [] }) }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./player', () => ({ attachSource: vi.fn(async () => () => {}) }));

/** The player is loaded on demand; under a full parallel run that import can take over 1 s. */
const LAZY_VIEWER_MS = 5000;
const video = (id: string): StoryVideoPublic => ({
  id,
  caption: 'Legenda ' + id,
  source: { type: 'file', src: `/assets/stories/${id}.mp4` },
  products: [],
});
const feed = (position: 'left' | 'right' = 'right'): StoriesFeed => ({
  collections: [],
  productPage: {
    enabled: true,
    position,
    videos: [video('v1'), video('v2')],
    byProduct: { cruz: ['v2', 'v1'] },
  },
});

describe('ProductVideoBubble', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('fica no lado escolhido pela loja, com o selo "Ver"', () => {
    const { container, rerender } = render(
      <ProductVideoBubble feed={feed()} productId="cruz" productName="Cruz" />,
    );
    expect(container.querySelector('.product-video-bubble')).toHaveClass('right');
    expect(screen.getByText('Ver')).toBeInTheDocument();
    rerender(<ProductVideoBubble feed={feed('left')} productId="cruz" productName="Cruz" />);
    expect(container.querySelector('.product-video-bubble')).toHaveClass('left');
  });

  it('abre o player com os vídeos da peça, o mais novo primeiro', async () => {
    const user = userEvent.setup();
    render(<ProductVideoBubble feed={feed()} productId="cruz" productName="Cruz" />);
    await user.click(screen.getByRole('button', { name: 'Ver vídeos de Cruz' }));
    expect(
      await screen.findByRole('dialog', { name: 'Vídeos da peça' }, { timeout: LAZY_VIEWER_MS }),
    ).toBeInTheDocument();
    expect(screen.getByText('Legenda v2')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver vídeos de Cruz' })).toHaveFocus();
  });

  it('fechar esconde a bolinha pelo resto da sessão', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <ProductVideoBubble feed={feed()} productId="cruz" productName="Cruz" />,
    );
    await user.click(screen.getByRole('button', { name: 'Fechar vídeos da peça' }));
    expect(screen.queryByRole('button', { name: 'Ver vídeos de Cruz' })).toBeNull();
    expect(sessionStorage.getItem(BUBBLE_DISMISS_KEY)).toBe('1');
    unmount();
    render(<ProductVideoBubble feed={feed()} productId="outra" productName="Outra" />);
    render(<ProductVideoBubble feed={feed()} productId="cruz" productName="Cruz" />);
    expect(screen.queryByRole('button', { name: /Ver vídeos de/ })).toBeNull();
  });

  it('com o armazenamento bloqueado, ainda fecha', async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ProductVideoBubble feed={feed()} productId="cruz" productName="Cruz" />);
    await user.click(screen.getByRole('button', { name: 'Fechar vídeos da peça' }));
    expect(screen.queryByRole('button', { name: 'Ver vídeos de Cruz' })).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });

  it('sem vídeos da peça não mostra nada', () => {
    const { container } = render(
      <ProductVideoBubble feed={feed()} productId="sem-video" productName="X" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

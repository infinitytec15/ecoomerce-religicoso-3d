import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import type {
  StoryEventType,
  StoryHighlightPublic,
  StorySource,
  StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import type { Product } from '@/lib/domain/types';
import { seedCatalog } from '@/lib/demo/seed';
import { money } from '@/lib/domain/format';
import { useCartStore } from '@/lib/store/cart';
import StoryViewer from './story-viewer';

const h = vi.hoisted(() => ({
  track: vi.fn<(videoId: string, type: StoryEventType) => void>(),
  catalog: [] as Product[] | undefined,
  attachSource: vi.fn<
    (video: HTMLVideoElement, source: StorySource, signal?: AbortSignal) => Promise<() => void>
  >(async () => () => {}),
}));
vi.mock('@/lib/api/query', () => ({ useCatalog: () => ({ data: h.catalog }) }));
vi.mock('./events', () => ({ useStoryTracker: () => h.track }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./player', () => ({ attachSource: h.attachSource }));
vi.mock('next/link', () => ({
  default: ({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
    />
  ),
}));

const video = (id: string, products: StoryVideoPublic['products'] = []): StoryVideoPublic => ({
  id,
  caption: 'Legenda ' + id,
  source: { type: 'file', src: `/assets/stories/${id}.mp4` },
  products,
});
const highlightA: StoryHighlightPublic = {
  id: 'a',
  title: 'Bastidores',
  coverUrl: '/assets/stories/bastidores.webp',
  format: 'stories',
  placements: ['home_top'],
  categories: ['Presentes'],
  videos: [
    video('a1', [
      { id: 'cruz-essencial', name: 'Cruz Essencial', priceCents: 8990, image: '/x.webp' },
    ]),
    video('a2'),
  ],
};
const cruz = seedCatalog.find((p) => p.id === 'cruz-essencial')!;
const kit = seedCatalog.find((p) => p.id === 'kit-oracao-familia')!;
const highlightB: StoryHighlightPublic = {
  ...highlightA,
  id: 'b',
  title: 'Oficina',
  videos: [video('b1')],
};
const highlights = [highlightA, highlightB];
const videoEl = () => document.querySelector('video')!;

describe('StoryViewer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    h.catalog = [cruz, kit];
    h.track.mockClear();
    useCartStore.setState({ items: [], isOpen: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('é um diálogo com o título do destaque, foco em Fechar e rolagem travada', () => {
    const { unmount } = render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Bastidores' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(h.attachSource).toHaveBeenCalledWith(
      videoEl(),
      highlightA.videos[0].source,
      expect.any(AbortSignal),
    );
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('continua aberto no que sobrou quando o vídeo atual sai do feed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StoryViewer highlights={highlights} start={1} onClose={onClose} />,
    );
    expect(screen.getByRole('dialog', { name: 'Oficina' })).toBeInTheDocument();
    rerender(<StoryViewer highlights={[highlightA]} start={1} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Bastidores' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fecha quando não sobra nenhum vídeo no feed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StoryViewer highlights={highlights} start={0} onClose={onClose} />,
    );
    rerender(<StoryViewer highlights={[]} start={0} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('começa sem som e alterna o som', async () => {
    const user = userEvent.setup();
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    expect(videoEl().muted).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Ativar som' }));
    expect(screen.getByRole('button', { name: 'Desativar som' })).toBeInTheDocument();
    expect(videoEl().muted).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Próximo vídeo' }));
    expect(videoEl().muted).toBe(false);
  });

  it('próximo vídeo percorre os destaques e fecha depois do último', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    const next = () => user.click(screen.getByRole('button', { name: 'Próximo vídeo' }));
    await next();
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
    const bars = screen.getAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuenow', '100');
    expect(bars[1]).toHaveAttribute('aria-valuenow', '0');
    await next();
    expect(screen.getByRole('dialog', { name: 'Oficina' })).toBeInTheDocument();
    expect(h.attachSource).toHaveBeenLastCalledWith(
      videoEl(),
      highlightB.videos[0].source,
      expect.any(AbortSignal),
    );
    expect(onClose).not.toHaveBeenCalled();
    await next();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('anterior no 1º vídeo de um destaque volta ao último do destaque anterior', async () => {
    const user = userEvent.setup();
    render(<StoryViewer highlights={highlights} start={1} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Vídeo anterior' }));
    expect(screen.getByRole('dialog', { name: 'Bastidores' })).toBeInTheDocument();
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
  });

  it('setas do teclado navegam e Escape fecha', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Legenda a1')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('timeupdate move a barra atual e ended avança', () => {
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    Object.defineProperty(videoEl(), 'duration', { configurable: true, value: 10 });
    videoEl().currentTime = 4;
    fireEvent.timeUpdate(videoEl());
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '40');
    fireEvent.ended(videoEl());
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
  });

  it('toque no terço esquerdo volta, no resto avança, e arrastar para baixo fecha', () => {
    const onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    const stage = videoEl().parentElement!;
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 600, right: 300, bottom: 600 }) as DOMRect;
    const tap = (x: number, y = 300, dy = 0) => {
      fireEvent.pointerDown(stage, { clientX: x, clientY: y, pointerId: 1 });
      fireEvent.pointerUp(stage, { clientX: x, clientY: y + dy, pointerId: 1 });
    };
    tap(250);
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
    tap(50);
    expect(screen.getByText('Legenda a1')).toBeInTheDocument();
    tap(150, 300, 40);
    expect(screen.getByText('Legenda a1')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    tap(150, 200, 120);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('erro mostra a mensagem e avança em 3 s', () => {
    vi.useFakeTimers();
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    fireEvent.error(videoEl());
    expect(screen.getByText('Não foi possível carregar este vídeo.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2900));
    expect(screen.getByText('Legenda a1')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar este vídeo.')).toBeNull();
  });

  it('playing registra play e ended registra complete do vídeo', () => {
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    fireEvent.playing(videoEl());
    fireEvent.ended(videoEl());
    expect(h.track.mock.calls).toEqual([
      ['a1', 'play'],
      ['a1', 'complete'],
    ]);
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
  });

  it('abre no vídeo pedido e usa o título informado', () => {
    render(
      <StoryViewer
        highlights={highlights}
        start={0}
        startVideo={1}
        title="Vídeos da peça"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Vídeos da peça' })).toBeInTheDocument();
    expect(screen.getByText('Legenda a2')).toBeInTheDocument();
  });

  it('fechar antes dos 3 s cancela o avanço do erro', () => {
    vi.useFakeTimers();
    const onClose = vi.fn(),
      { unmount } = render(<StoryViewer highlights={highlights} start={1} onClose={onClose} />);
    fireEvent.error(videoEl());
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível carregar este vídeo.');
    const clear = vi.spyOn(globalThis, 'clearTimeout'),
      errors = vi.spyOn(console, 'error');
    unmount();
    expect(clear).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    expect(onClose).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('Tab com o foco fora do diálogo traz o foco para dentro', async () => {
    const user = userEvent.setup();
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('"Ver peça" leva à peça e registra o clique do vídeo atual', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    const link = screen.getByRole('link', { name: /Ver peça/ });
    expect(link).toHaveAttribute('href', '/produto/cruz-essencial');
    expect(screen.getByText('Cruz Essencial')).toBeInTheDocument();
    // The catalog price wins over the one in the feed.
    expect(screen.getByText(money(cruz.priceCents).replace(/\s/g, ' '))).toBeInTheDocument();
    await user.click(link);
    expect(h.track).toHaveBeenCalledWith('a1', 'product_click');
    expect(onClose).toHaveBeenCalled();
  });

  it('"Comprar" abre a compra no vídeo, pausado, e adiciona a peça com o vídeo', async () => {
    const user = userEvent.setup(),
      pause = vi.mocked(HTMLMediaElement.prototype.pause);
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Comprar Cruz Essencial' }));
    const sheet = screen.getByRole('dialog', { name: 'Comprar Cruz Essencial' });
    expect(pause).toHaveBeenCalled();
    expect(within(sheet).getByRole('button', { name: /^Marfim/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: /^Areia/ }));
    await user.click(within(sheet).getByRole('button', { name: /^20 cm/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Adicionar à sacola' }));
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({
        productId: 'cruz-essencial',
        color: 'Areia',
        sizeIndex: 1,
        quantity: 1,
        videoId: 'a1',
      }),
    ]);
    expect(h.track).toHaveBeenCalledWith('a1', 'add_to_cart');
    expect(within(sheet).getByRole('heading', { name: 'Adicionado à sacola' })).toBeInTheDocument();
  });

  it('"Continuar assistindo" fecha a compra e volta a tocar', async () => {
    const user = userEvent.setup(),
      play = vi.mocked(HTMLMediaElement.prototype.play);
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Comprar Cruz Essencial' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar à sacola' }));
    play.mockClear();
    await user.click(screen.getByRole('button', { name: 'Continuar assistindo' }));
    expect(screen.queryByRole('dialog', { name: 'Comprar Cruz Essencial' })).toBeNull();
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Comprar Cruz Essencial' })).toHaveFocus();
  });

  it('"Ver sacola" fecha o player e abre a sacola', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Comprar Cruz Essencial' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar à sacola' }));
    await user.click(screen.getByRole('button', { name: 'Ver sacola' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCartStore.getState().isOpen).toBe(true);
  });

  it('um kit vai direto para a sacola com o vídeo', async () => {
    const user = userEvent.setup();
    const withKit: StoryHighlightPublic = {
      ...highlightA,
      videos: [
        video('k1', [{ id: kit.id, name: kit.name, priceCents: kit.priceCents, image: '/k.webp' }]),
      ],
    };
    render(<StoryViewer highlights={[withKit]} start={0} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Comprar ' + kit.name }));
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ productId: kit.id, videoId: 'k1', kit: expect.anything() }),
    ]);
    expect(h.track).toHaveBeenCalledWith('k1', 'add_to_cart');
    expect(screen.getByRole('heading', { name: 'Adicionado à sacola' })).toBeInTheDocument();
  });

  it('um kit que não entra na sacola abre a compra, que mostra o erro', async () => {
    const user = userEvent.setup();
    const add = useCartStore.getState().add;
    useCartStore.setState({
      add: () => {
        throw new Error('sem espaço');
      },
    });
    const withKit: StoryHighlightPublic = {
      ...highlightA,
      videos: [
        video('k1', [{ id: kit.id, name: kit.name, priceCents: kit.priceCents, image: '/k.webp' }]),
      ],
    };
    try {
      render(<StoryViewer highlights={[withKit]} start={0} onClose={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Comprar ' + kit.name }));
      expect(screen.queryByRole('heading', { name: 'Adicionado à sacola' })).toBeNull();
      expect(h.track).not.toHaveBeenCalledWith('k1', 'add_to_cart');
      await user.click(screen.getByRole('button', { name: /Adicionar à sacola/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível adicionar esta peça.',
      );
    } finally {
      useCartStore.setState({ add });
    }
  });

  it('peça fora do catálogo fica só com "Ver peça"', () => {
    h.catalog = undefined;
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Comprar/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver peça Cruz Essencial' })).toBeInTheDocument();
  });

  it('Escape fecha primeiro a compra, depois o player; setas não navegam com a compra aberta', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Comprar Cruz Essencial' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Legenda a1')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Comprar Cruz Essencial' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab fica preso dentro da compra aberta', async () => {
    const user = userEvent.setup();
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Comprar Cruz Essencial' }));
    const sheet = screen.getByRole('dialog', { name: 'Comprar Cruz Essencial' });
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import type {
  StoryEvent,
  StoryHighlightPublic,
  StorySource,
  StoryVideoPublic,
} from '@maos-em-oracao/contracts';
import StoryViewer from './story-viewer';

const h = vi.hoisted(() => ({
  storyEvent: vi.fn<(event: StoryEvent) => Promise<void>>(async () => {}),
  attachSource: vi.fn<(video: HTMLVideoElement, source: StorySource) => Promise<() => void>>(
    async () => () => {},
  ),
}));
vi.mock('@/lib/api/query', () => ({ useGateway: () => ({ storyEvent: h.storyEvent }) }));
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
  placements: ['home'],
  categories: ['Presentes'],
  videos: [
    video('a1', [
      { id: 'cruz-essencial', name: 'Cruz Essencial', priceCents: 8990, image: '/x.webp' },
    ]),
    video('a2'),
  ],
};
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
    expect(h.attachSource).toHaveBeenCalledWith(videoEl(), highlightA.videos[0].source);
    unmount();
    expect(document.body.style.overflow).toBe('');
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
    expect(h.attachSource).toHaveBeenLastCalledWith(videoEl(), highlightB.videos[0].source);
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

  it('dois playing do mesmo vídeo geram uma única visualização', () => {
    render(<StoryViewer highlights={highlights} start={0} onClose={vi.fn()} />);
    fireEvent.playing(videoEl());
    fireEvent.playing(videoEl());
    expect(h.storyEvent).toHaveBeenCalledTimes(1);
    expect(h.storyEvent).toHaveBeenCalledWith({ videoId: 'a1', type: 'view' });
  });

  it('"Ver peça" leva à peça e registra o clique do vídeo atual', async () => {
    const user = userEvent.setup(),
      onClose = vi.fn();
    render(<StoryViewer highlights={highlights} start={0} onClose={onClose} />);
    const link = screen.getByRole('link', { name: /Ver peça/ });
    expect(link).toHaveAttribute('href', '/produto/cruz-essencial');
    expect(screen.getByText('Cruz Essencial')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s89,90/)).toBeInTheDocument();
    await user.click(link);
    expect(h.storyEvent).toHaveBeenCalledWith({ videoId: 'a1', type: 'click' });
    expect(onClose).toHaveBeenCalled();
  });
});

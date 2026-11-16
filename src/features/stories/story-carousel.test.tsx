import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryEventType, StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { StoryCarousel } from './story-carousel';

/** The player is loaded on demand; under a full parallel run that import can take over 1 s. */
const LAZY_VIEWER_MS = 5000;
const h = vi.hoisted(() => ({ track: vi.fn<(videoId: string, type: StoryEventType) => void>() }));
vi.mock('./events', () => ({ useStoryTracker: () => h.track }));
vi.mock('@/lib/api/query', () => ({ useCatalog: () => ({ data: [] }) }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./player', () => ({ attachSource: vi.fn(async () => () => {}) }));

const highlight: StoryHighlightPublic = {
  id: 'carrossel',
  title: 'Na oficina',
  coverUrl: '/c.webp',
  format: 'carousel',
  placements: ['home_middle'],
  categories: [],
  videos: [
    {
      id: 'v1',
      caption: 'Pintura à mão',
      source: { type: 'hls', src: 'https://cdn.test/v1.m3u8', poster: 'https://cdn.test/v1.jpg' },
      products: [{ id: 'cruz', name: 'Cruz Essencial', priceCents: 8990, image: '/x.webp' }],
    },
    {
      id: 'v2',
      caption: 'Embalagem',
      source: { type: 'file', src: '/assets/stories/v2.mp4' },
      products: [],
    },
  ],
};

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observed: { callback: Callback; targets: Element[] }[] = [];

describe('StoryCarousel', () => {
  beforeEach(() => {
    observed = [];
    h.track.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mostra o título e um cartão por vídeo, com pôster, legenda, peça e preço', () => {
    const { container } = render(<StoryCarousel highlight={highlight} />);
    const region = screen.getByRole('region', { name: 'Na oficina' });
    const cards = within(region).getAllByRole('button', { name: /Assistir/ });
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Cruz Essencial')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/R\$\s89,90/)).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/v1.jpg');
    const frame = container.querySelector('video')!;
    expect(frame).toHaveAttribute('preload', 'metadata');
    expect(frame.muted).toBe(true);
  });

  it('o cartão abre o player naquele vídeo', async () => {
    const user = userEvent.setup();
    render(<StoryCarousel highlight={highlight} />);
    await user.click(screen.getByRole('button', { name: 'Assistir: Embalagem' }));
    const dialog = await screen.findByRole(
      'dialog',
      { name: 'Na oficina' },
      { timeout: LAZY_VIEWER_MS },
    );
    expect(within(dialog).getByText('Embalagem')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '100');
  });

  it('conta impressão quando metade do cartão aparece, uma vez', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: Callback) {
          observed.push({ callback, targets: [] });
        }
        observe(target: Element) {
          observed.at(-1)!.targets.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    render(<StoryCarousel highlight={highlight} />);
    const { callback, targets } = observed[0];
    expect(targets.map((t) => (t as HTMLElement).dataset.videoId)).toEqual(['v1', 'v2']);
    act(() =>
      callback([
        { target: targets[0], isIntersecting: true, intersectionRatio: 0.6 },
        { target: targets[1], isIntersecting: true, intersectionRatio: 0.2 },
      ]),
    );
    expect(h.track.mock.calls).toEqual([['v1', 'impression']]);
  });

  it('sem IntersectionObserver não quebra', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<StoryCarousel highlight={highlight} />);
    expect(h.track).not.toHaveBeenCalled();
  });
});

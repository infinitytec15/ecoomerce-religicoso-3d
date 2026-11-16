import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { StoriesRow } from './stories-row';

vi.mock('@/lib/api/query', () => ({
  useGateway: () => ({ storyEvents: vi.fn(async () => {}) }),
  useCatalog: () => ({ data: [] }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));
vi.mock('./player', () => ({ attachSource: vi.fn(async () => () => {}) }));

/** The player is loaded on demand; under a full parallel run that import can take over 1 s. */
const LAZY_VIEWER_MS = 5000;
const highlight: StoryHighlightPublic = {
  id: 'destaque-demo',
  title: 'Bastidores',
  coverUrl: '/assets/stories/bastidores.webp',
  format: 'stories',
  placements: ['home_top'],
  categories: ['Presentes'],
  videos: [
    {
      id: 'video-demo-1',
      caption: 'Da impressora para a sua casa',
      source: { type: 'file', src: '/assets/stories/oficina-1.mp4' },
      products: [],
    },
  ],
};

describe('StoriesRow', () => {
  it('mostra uma bolinha por destaque, sem vídeo antes do clique', () => {
    const { container } = render(
      <StoriesRow highlights={[highlight, { ...highlight, id: 'outro', title: 'Oficina' }]} />,
    );
    expect(screen.getByRole('region', { name: 'Destaques em vídeo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir destaque Bastidores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir destaque Oficina' })).toBeInTheDocument();
    const cover = container.querySelector('img');
    expect(cover).toHaveAttribute('src', '/assets/stories/bastidores.webp');
    expect(cover).toHaveAttribute('loading', 'lazy');
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('com título, mostra o título e usa-o como nome da seção', () => {
    render(<StoriesRow highlights={[highlight]} title="Veja em vídeo" />);
    expect(screen.getByRole('region', { name: 'Veja em vídeo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Veja em vídeo' })).toBeInTheDocument();
  });

  it('lista vazia não renderiza nada', () => {
    const { container } = render(<StoriesRow highlights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('o clique abre o viewer no destaque escolhido', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    render(<StoriesRow highlights={[highlight]} />);
    await user.click(screen.getByRole('button', { name: 'Abrir destaque Bastidores' }));
    expect(
      await screen.findByRole('dialog', { name: 'Bastidores' }, { timeout: LAZY_VIEWER_MS }),
    ).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

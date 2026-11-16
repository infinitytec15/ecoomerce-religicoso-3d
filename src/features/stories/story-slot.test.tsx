import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import { StorySlot, slotGroups } from './story-slot';

vi.mock('@/lib/api/query', () => ({
  useGateway: () => ({ storyEvents: vi.fn(async () => {}) }),
  useCatalog: () => ({ data: [] }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));

const collection = (
  id: string,
  format: StoryHighlightPublic['format'],
  placements: StoryHighlightPublic['placements'] = ['home_top'],
): StoryHighlightPublic => ({
  id,
  title: 'Coleção ' + id,
  coverUrl: '/c.webp',
  format,
  placements,
  categories: [],
  videos: [
    {
      id: 'v-' + id,
      caption: 'Legenda ' + id,
      source: { type: 'file', src: '/a.mp4' },
      products: [],
    },
  ],
});

describe('StorySlot', () => {
  const list = [
    collection('c1', 'carousel'),
    collection('s1', 'stories'),
    collection('fora', 'stories', ['home_bottom']),
    collection('s2', 'stories'),
    collection('c2', 'carousel'),
  ];

  it('separa as coleções do lugar por formato, na ordem recebida', () => {
    const { bubbles, carousels } = slotGroups(list, { place: 'home_top' });
    expect(bubbles.map((h) => h.id)).toEqual(['s1', 's2']);
    expect(carousels.map((h) => h.id)).toEqual(['c1', 'c2']);
  });

  it('desenha uma única fileira de bolinhas e um carrossel por coleção', () => {
    render(<StorySlot collections={list} where={{ place: 'home_top' }} />);
    expect(screen.getAllByRole('region', { name: 'Destaques em vídeo' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Abrir destaque Coleção s1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir destaque Coleção s2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir destaque Coleção fora' })).toBeNull();
    const order = [
      screen.getByRole('region', { name: 'Destaques em vídeo' }),
      screen.getByRole('region', { name: 'Coleção c1' }),
      screen.getByRole('region', { name: 'Coleção c2' }),
    ];
    expect(screen.getAllByRole('region')).toEqual(order);
  });

  it('lugar vazio não desenha nada', () => {
    const { container } = render(<StorySlot collections={list} where={{ place: 'home_middle' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import type { StoryHighlightPublic } from '@maos-em-oracao/contracts';
import StoryViewer from './story-viewer';

// The real attachSource: StrictMode runs the source effect twice, and the first run's late
// cleanup must not remove the source the second run attached.
vi.mock('@/lib/api/query', () => ({
  useGateway: () => ({ storyEvents: vi.fn(async () => {}) }),
  useCatalog: () => ({ data: [] }),
}));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));

const highlight: StoryHighlightPublic = {
  id: 'destaque-demo',
  title: 'Bastidores',
  coverUrl: '/assets/stories/bastidores.webp',
  format: 'stories',
  placements: ['home_top'],
  categories: ['Presentes'],
  videos: [
    {
      id: 'video-strict',
      caption: 'Da impressora para a sua casa',
      source: { type: 'file', src: '/assets/stories/oficina-1.mp4' },
      products: [],
    },
  ],
};

describe('StoryViewer em StrictMode', () => {
  it('mantém a fonte do vídeo depois do efeito duplo', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const { unmount } = render(
      <StrictMode>
        <StoryViewer highlights={[highlight]} start={0} onClose={vi.fn()} />
      </StrictMode>,
    );
    const video = document.querySelector('video')!;
    await waitFor(() => expect(play).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(video.getAttribute('src')).toBe('/assets/stories/oficina-1.mp4');
    unmount();
    expect(video.hasAttribute('src')).toBe(false);
  });
});

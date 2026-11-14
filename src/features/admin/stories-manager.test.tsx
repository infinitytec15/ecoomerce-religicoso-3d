import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminStoryHighlight } from '@maos-em-oracao/contracts';
import { StoriesManager } from './stories-manager';
import { uploadMedia } from '@/lib/media/upload';

const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useAdminAction: () => ({ run }),
}));
const adminData = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./admin-frame', () => ({ useAdminData: () => adminData.value }));
vi.mock('@/lib/media/cover', () => ({ squareCover: vi.fn(async (file: File) => file) }));
vi.mock('@/lib/media/upload', () => ({ uploadMedia: vi.fn() }));
vi.mock('@/lib/api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/config')>()),
  IS_DEMO: false,
}));
vi.mock('@/lib/media/assets', () => ({ saveAsset: vi.fn() }));
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (source?: string) => source }));

const products = ['Terço', 'Cruz', 'Anjo', 'Bíblia'].map((name, i) => ({
  id: `p${i + 1}`,
  name,
  archived: false,
}));
const first: AdminStoryHighlight = {
  id: 'h1',
  title: 'Bastidores',
  coverAssetId: 'c1',
  coverUrl: '/assets/capa-1.webp',
  active: true,
  position: 0,
  placements: ['home', 'product'],
  categories: [],
  videos: [
    {
      id: 'v1',
      assetId: 'a1',
      caption: 'Pintura do terço',
      productIds: ['p1'],
      active: true,
      position: 0,
      status: 'processing',
      views: 0,
      clicks: 0,
    },
    {
      id: 'v2',
      assetId: 'a2',
      caption: 'Embalando',
      productIds: ['p2'],
      active: true,
      position: 1,
      status: 'ready',
      views: 8,
      clicks: 1,
    },
  ],
};
const second: AdminStoryHighlight = {
  id: 'h2',
  title: 'Presentes',
  coverAssetId: 'c2',
  active: false,
  position: 1,
  placements: ['category'],
  categories: ['Presentes'],
  videos: [],
};

describe('stories manager', () => {
  beforeEach(() => {
    run.mockClear();
    adminData.value = { stories: [second, first], products };
  });

  it('lists highlights by position with places and video counts', () => {
    render(<StoriesManager />);
    expect(screen.getByText('Página inicial, Página do produto')).toBeInTheDocument();
    expect(screen.getByText('2 · 1 processando')).toBeInTheDocument();
    expect(screen.getByText('Categoria (Presentes)')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Bastidores')).toBeInTheDocument();
  });

  it('reorders with the full list of ids', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Descer Bastidores' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ type: 'story.reorder', ids: ['h2', 'h1'] });
  });

  it('requires a category when the category place is checked', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Católicos')).not.toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Categoria'));
    expect(within(dialog).getByLabelText('Católicos')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar destaque' }));
    expect(await within(dialog).findByText('Escolha ao menos uma categoria.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('saves a highlight with its places', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar destaque' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      type: 'story.save',
      id: 'h1',
      title: 'Bastidores',
      coverAssetId: 'c1',
      active: true,
      placements: ['home', 'product'],
      categories: [],
    });
  });

  it('keeps save disabled for a new highlight without title and cover', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Novo destaque' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Salvar destaque' })).toBeDisabled();
  });

  it('shows status and click rate in the videos dialog', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Processando')).toBeInTheDocument();
    expect(within(dialog).getByText('12,5%')).toBeInTheDocument();
    expect(within(dialog).getByText(/ficam alguns minutos em processamento/)).toBeInTheDocument();
  });

  it('removes a video after confirmation', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remover Embalando' }));
    expect(within(dialog).getByText('Remover este vídeo do destaque?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remover vídeo' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ type: 'story.video.delete', id: 'v2' });
  });

  it('limits a video to three products', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Editar Embalando' }));
    expect(within(dialog).getByText('Até 3 peças por vídeo.')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Terço'));
    await user.click(within(dialog).getByLabelText('Anjo'));
    expect(within(dialog).getByLabelText('Cruz')).toBeChecked();
    expect(within(dialog).getByLabelText('Bíblia')).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar vídeo' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toMatchObject({
      type: 'story.video.save',
      id: 'v2',
      highlightId: 'h1',
      productIds: ['p2', 'p1', 'p3'],
    });
  });

  it('deletes a highlight after confirmation', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Excluir Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Excluir o destaque “Bastidores” e seus vídeos? As visualizações e os cliques também serão apagados.',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Excluir destaque' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ type: 'story.delete', id: 'h1' });
  });

  it('disables reorder buttons while a reorder is in flight', async () => {
    let finish: () => void = () => {};
    run.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Descer Bastidores' }));
    expect(screen.getByRole('button', { name: 'Subir Presentes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Bastidores' })).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Subir Presentes' })).toBeEnabled(),
    );
  });

  describe('video adder', () => {
    const openAdder = async () => {
      const user = userEvent.setup();
      render(<StoriesManager />);
      await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar vídeo' }));
      return { user, dialog };
    };
    const video = () => new File(['x'], 'v.mp4', { type: 'video/mp4' });

    it('shows progress, locks Voltar, then the form', async () => {
      let report: (n: number) => void = () => {};
      let resolve: (v: Awaited<ReturnType<typeof uploadMedia>>) => void = () => {};
      vi.mocked(uploadMedia).mockImplementationOnce((_f, _k, onProgress) => {
        report = onProgress!;
        return new Promise((r) => (resolve = r));
      });
      const { user, dialog } = await openAdder();
      await user.upload(within(dialog).getByLabelText('Vídeo'), video());
      act(() => report(42));
      expect(await within(dialog).findByText('Enviando… 42%')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Voltar' })).toBeDisabled();
      await act(async () => resolve({ id: 'asset-9' } as Awaited<ReturnType<typeof uploadMedia>>));
      expect(await within(dialog).findByLabelText(/Legenda/)).toBeInTheDocument();
    });

    it('shows the error when the upload fails', async () => {
      vi.mocked(uploadMedia).mockRejectedValueOnce(new Error('Falha no envio.'));
      const { user, dialog } = await openAdder();
      await user.upload(within(dialog).getByLabelText('Vídeo'), video());
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Falha no envio.');
    });
  });
});

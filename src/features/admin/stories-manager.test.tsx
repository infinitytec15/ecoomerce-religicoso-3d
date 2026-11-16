import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminStoryHighlight } from '@maos-em-oracao/contracts';
import { StoriesManager, storefrontStatus } from './stories-manager';
import { money } from '@/lib/domain/format';

/** Currency text as the DOM matcher sees it (the non-breaking space normalized). */
const brl = (cents: number) => money(cents).replace(/\s/g, ' ');
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
  format: 'stories',
  placements: ['home_top', 'home_middle'],
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
      impressions: 0,
      completes: 0,
      carts: 0,
      orders: 0,
      revenueCents: 0,
    },
    {
      id: 'v2',
      assetId: 'a2',
      caption: 'Embalando',
      productIds: ['p2'],
      active: true,
      position: 1,
      status: 'ready',
      impressions: 40,
      views: 8,
      completes: 5,
      clicks: 1,
      carts: 1,
      orders: 1,
      revenueCents: 12990,
    },
  ],
};
const second: AdminStoryHighlight = {
  id: 'h2',
  title: 'Presentes',
  coverAssetId: 'c2',
  active: false,
  position: 1,
  format: 'carousel',
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
    expect(screen.getByText('Início · topo, Início · meio')).toBeInTheDocument();
    expect(screen.getByText('Stories (bolinhas)')).toBeInTheDocument();
    expect(screen.getByText('Carrossel de vídeos')).toBeInTheDocument();
    expect(screen.getByText('2 · 1 processando')).toBeInTheDocument();
    expect(screen.getByText('Categoria (Presentes)')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Bastidores')).toBeInTheDocument();
  });

  it('says whether each highlight is really on the store and why not', () => {
    const noVideo: AdminStoryHighlight = { ...second, id: 'h3', title: 'Vazio', active: true },
      waiting: AdminStoryHighlight = {
        ...first,
        id: 'h4',
        title: 'Aguardando',
        position: 3,
        videos: [first.videos[0]],
      },
      broken: AdminStoryHighlight = {
        ...first,
        id: 'h5',
        title: 'Quebrado',
        position: 4,
        videos: [{ ...first.videos[1], status: 'failed' }],
      },
      hidden: AdminStoryHighlight = {
        ...first,
        id: 'h6',
        title: 'Escondido',
        position: 5,
        videos: [{ ...first.videos[1], active: false }],
      };
    adminData.value = { stories: [first, second, noVideo, waiting, broken, hidden], products };
    render(<StoriesManager />);
    const status = (title: string) =>
      within(screen.getByRole('row', { name: new RegExp('^\\s*' + title) })).getByText(
        /Na loja|Inativo|Sem vídeo|Vídeo processando|Vídeo falhou/,
      ).textContent;
    expect(status('Bastidores')).toBe('Na loja');
    expect(status('Presentes')).toBe('Inativo');
    expect(status('Vazio')).toBe('Sem vídeo');
    expect(status('Aguardando')).toBe('Vídeo processando');
    expect(status('Quebrado')).toBe('Vídeo falhou');
    expect(status('Escondido')).toBe('Sem vídeo');
  });

  it('opens the videos of a highlight right after creating it', async () => {
    const user = userEvent.setup();
    vi.mocked(uploadMedia).mockResolvedValueOnce({
      id: 'c9',
      name: 'capa.png',
      kind: 'image',
      mime: 'image/png',
      size: 10,
      storage: 'bunny-storage',
      status: 'ready',
      created: '2026-11-16T00:00:00.000Z',
      url: '/assets/capa-9.webp',
    });
    const created: AdminStoryHighlight = {
      ...second,
      id: 'h9',
      title: 'Novidades',
      active: true,
      position: 2,
      placements: ['home_top'],
      categories: [],
    };
    run.mockImplementationOnce(async () => {
      adminData.value = { stories: [second, first, created], products };
    });
    const view = render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Novo destaque' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Título/), 'Novidades');
    await user.upload(
      within(dialog).getByLabelText('Capa'),
      new File(['x'], 'capa.png', { type: 'image/png' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Salvar destaque' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    view.rerender(<StoriesManager />);
    const videos = await screen.findByRole('dialog', { name: 'Vídeos' });
    expect(
      within(videos).getByText(
        'Envie ao menos um vídeo: sem vídeo pronto, o destaque não aparece na loja.',
      ),
    ).toBeInTheDocument();
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
      format: 'stories',
      placements: ['home_top', 'home_middle'],
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
    expect(
      within(dialog).getByText(
        'Vídeos novos ficam alguns minutos em processamento no Bunny e só aparecem na loja quando ficam prontos.',
      ),
    ).toBeInTheDocument();
  });

  it('labels archived linked products in the video form', async () => {
    const user = userEvent.setup();
    adminData.value = {
      stories: [second, first],
      products: [{ ...products[0], archived: true }, ...products.slice(1)],
    };
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Editar Pintura do terço' }));
    expect(await screen.findByLabelText('Terço (arquivada)')).toBeChecked();
    expect(screen.queryByLabelText('Terço')).not.toBeInTheDocument();
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

  it('says a highlight without places only shows on the product page', () => {
    const productOnly: AdminStoryHighlight = { ...first, placements: [] };
    expect(storefrontStatus(productOnly)).toBe('Só na página do produto');
    expect(storefrontStatus({ ...productOnly, active: false })).toBe('Inativo');
    expect(storefrontStatus({ ...productOnly, videos: [first.videos[0]] })).toBe(
      'Vídeo processando',
    );
    adminData.value = { stories: [productOnly], products };
    render(<StoriesManager />);
    const row = screen.getByRole('row', { name: /^\s*Bastidores/ });
    expect(within(row).getAllByText('Só na página do produto')).toHaveLength(2);
  });

  it('saves the format and no place, with a hint about the product page', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Stories (bolinhas)')).toBeChecked();
    await user.click(within(dialog).getByLabelText('Carrossel de vídeos'));
    const hint = 'Sem lugar na loja: os vídeos ainda aparecem na página das peças marcadas.';
    expect(within(dialog).queryByText(hint)).not.toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Início · topo'));
    await user.click(within(dialog).getByLabelText('Início · meio'));
    expect(within(dialog).getByText(hint)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar destaque' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toMatchObject({
      type: 'story.save',
      id: 'h1',
      format: 'carousel',
      placements: [],
      categories: [],
    });
  });

  it('sends the places in the store order with the new home slots', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Editar Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Início · final'));
    await user.click(within(dialog).getByLabelText('Início · abaixo do banner'));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar destaque' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toMatchObject({
      placements: ['home_top', 'home_below_banner', 'home_middle', 'home_bottom'],
    });
  });

  it('starts a new highlight as stories on top of the home', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    await user.click(screen.getByRole('button', { name: 'Novo destaque' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Stories (bolinhas)')).toBeChecked();
    expect(within(dialog).getByLabelText('Início · topo')).toBeChecked();
    expect(within(dialog).getByLabelText('Categoria')).not.toBeChecked();
  });

  it('saves the product page bubble setting', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    const card = screen.getByRole('region', { name: 'Página do produto' });
    const toggle = within(card).getByRole('switch', {
      name: 'Mostrar bolinha de vídeo na página do produto',
    });
    expect(toggle).toBeChecked();
    expect(within(card).getByLabelText('Direita')).toBeChecked();
    await user.click(within(card).getByLabelText('Esquerda'));
    await user.click(within(card).getByRole('button', { name: 'Salvar página do produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      type: 'story.settings',
      productPage: { enabled: true, position: 'left' },
    });
  });

  it('reads the stored product page setting and can turn it off', async () => {
    const user = userEvent.setup();
    adminData.value = {
      stories: [second, first],
      products,
      storySettings: { productPage: { enabled: true, position: 'left' } },
    };
    render(<StoriesManager />);
    const card = screen.getByRole('region', { name: 'Página do produto' });
    expect(within(card).getByLabelText('Esquerda')).toBeChecked();
    await user.click(within(card).getByRole('switch'));
    expect(within(card).getByLabelText('Direita')).toBeDisabled();
    await user.click(within(card).getByRole('button', { name: 'Salvar página do produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({
      type: 'story.settings',
      productPage: { enabled: false, position: 'left' },
    });
  });

  it('shows the video commerce funnel for all videos and for each video', async () => {
    const user = userEvent.setup();
    render(<StoriesManager />);
    const metric = (label: string) =>
      screen
        .getAllByText(label)
        .find((el) => el.closest('.admin-stat'))!
        .closest('.admin-stat')!;
    expect(within(metric('Impressões') as HTMLElement).getByText('40')).toBeInTheDocument();
    expect(within(metric('Visualizações') as HTMLElement).getByText('8')).toBeInTheDocument();
    expect(
      within(metric('Assistidos até o fim') as HTMLElement).getByText('5'),
    ).toBeInTheDocument();
    expect(within(metric('Taxa de clique') as HTMLElement).getByText('12,5%')).toBeInTheDocument();
    expect(within(metric('Sacola') as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(metric('Receita') as HTMLElement).getByText(brl(12990))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vídeos de Bastidores' }));
    const dialog = await screen.findByRole('dialog');
    const line = within(dialog).getByText('Embalando').closest('li')!;
    for (const label of [
      'Impressões',
      'Visualizações',
      'Assistidos até o fim',
      'Cliques em produto',
      'Sacola',
      'Pedidos',
      'Receita',
      'Taxa de clique',
    ])
      expect(within(line).getByText(label, { exact: false })).toBeInTheDocument();
    expect(within(line).getByText(brl(12990))).toBeInTheDocument();
  });

  it('reads 0 for counters missing from an older snapshot', () => {
    const { impressions, completes, carts, orders, revenueCents, ...old } = first.videos[1];
    void [impressions, completes, carts, orders, revenueCents];
    adminData.value = {
      stories: [{ ...first, videos: [old] }],
      products,
    };
    render(<StoriesManager />);
    expect(screen.getByText(brl(0))).toBeInTheDocument();
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

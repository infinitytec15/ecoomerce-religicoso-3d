import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductEditor } from './product-editor';
import { ProductGallery, videoReference } from '@/features/catalog/product-media';
import { createSeed } from '@/lib/demo/seed';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', () => ({ useAdminAction: () => ({ run }) }));
vi.mock('./admin-frame', () => ({
  useAdminData: () => ({ workspace: { ...defaultWorkspaceSettings } }),
}));
describe('product publishing and media controls', () => {
  it('requires an image before publishing and removes the previous cover when saved as a draft', async () => {
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Mídia da vitrine' }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Adicione uma imagem');
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Produto' }));
    await user.selectOptions(screen.getByLabelText('Visibilidade'), 'false');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'product.save',
          product: expect.objectContaining({
            active: false,
            media: [],
            image: '/assets/products/placeholder.svg',
          }),
        }),
      ),
    );
  });
  it('saves price and cost per size, aligned with the sizes list', async () => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    const sizes = screen.getByLabelText('Tamanhos (separados por vírgula)');
    await user.clear(sizes);
    await user.type(sizes, '15 cm, 20 cm, 25 cm');
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    const price = screen.getByLabelText('Preço — 25 cm');
    await user.clear(price);
    await user.type(price, '159,90');
    const material = screen.getByLabelText('Matéria-prima — 25 cm');
    await user.clear(material);
    await user.type(material, '26,00');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const saved = run.mock.calls[0][0].product;
    expect(saved.sizePrices[2]).toBe(15990);
    expect(saved.costBySize[2].materialCents).toBe(2600);
    expect(saved.priceCents).toBe(saved.sizePrices[0]);
  });
  it('reads thousand separators in the size price', async () => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    const price = screen.getAllByLabelText(/^Preço — /)[0];
    await user.clear(price);
    await user.type(price, '1.299,90');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0].product.sizePrices[0]).toBe(129990);
  });
  it('drops extra rows when the sizes list shrinks', async () => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    const sizes = screen.getByLabelText('Tamanhos (separados por vírgula)');
    await user.clear(sizes);
    await user.type(sizes, '15 cm, 20 cm');
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    expect(screen.getAllByLabelText(/^Preço — /)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const saved = run.mock.calls[0][0].product;
    expect(saved.sizePrices).toHaveLength(2);
    expect(saved.costBySize).toHaveLength(2);
  });
  it('fills a row from the calculator and saves the five cost parts', async () => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    await user.click(screen.getAllByRole('button', { name: /^Calcular/ })[1]);
    const dialog = await screen.findByRole('dialog');
    const fill = async (label: string, value: string) => {
      const input = within(dialog).getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    };
    await fill('Filamento (g)', '120');
    await fill('Tempo de impressão (h)', '6');
    await fill('Peças por mesa', '1');
    await fill('Mão de obra (min)', '20');
    await user.selectOptions(within(dialog).getByLabelText('Embalagem'), 'Padrão');
    await user.click(within(dialog).getByRole('button', { name: 'Usar este custo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const sizeLabel = screen
      .getAllByLabelText(/^Preço — /)[1]
      .getAttribute('aria-label')!
      .split('— ')[1];
    expect(screen.getByLabelText(`Matéria-prima — ${sizeLabel}`)).toHaveValue('14,40');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0].product.costBySize[1]).toEqual({
      materialCents: 1440,
      energyCents: 1106,
      laborCents: 1000,
      packagingCents: 400,
      otherCents: 283,
    });
  });
  it('warns when a size sells below its cost', async () => {
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    expect(screen.queryByText(/com prejuízo/)).not.toBeInTheDocument();
    const price = screen.getAllByLabelText(/^Preço — /)[0];
    await user.clear(price);
    await user.type(price, '0,50');
    expect(await screen.findByRole('alert')).toHaveTextContent('Algum tamanho está com prejuízo');
  });
  it.each(['abc', '0', '-5', '1,2,3'])('blocks saving an invalid price (%s)', async (bad) => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    const price = screen.getAllByLabelText(/^Preço — /)[0];
    await user.clear(price);
    await user.type(price, bad);
    await user.click(screen.getByRole('button', { name: 'Produto' }));
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /Informe um preço válido para/.test(a.textContent || ''))).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Preço e custo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('blocks a negative cost part', async () => {
    run.mockClear();
    const user = userEvent.setup();
    render(<ProductEditor product={createSeed().products[0]} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    const m = screen.getAllByLabelText(/^Matéria-prima — /)[0];
    await user.clear(m);
    await user.type(m, '-3');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    expect(await screen.findByText(/Informe um custo válido em Matéria-prima/)).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });
  it('shows the 3D action only when the product has an uploaded ready model', () => {
    const p = createSeed().products[0],
      open = vi.fn();
    const { rerender } = render(<ProductGallery product={p} onView3D={open} />);
    expect(screen.queryByRole('button', { name: /Ver peça em 3D/ })).not.toBeInTheDocument();
    rerender(
      <ProductGallery
        product={{
          ...p,
          model: { assetId: 'uploaded-file', filename: 'peca.stl', format: 'stl', status: 'ready' },
        }}
        onView3D={open}
      />,
    );
    expect(screen.getByRole('button', { name: /Ver peça em 3D/ })).toBeInTheDocument();
  });
  it('canonicalizes supported videos and rejects active or unrelated URLs', () => {
    expect(videoReference('https://youtu.be/aqz-KE-bpKQ').url).toBe(
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    );
    expect(videoReference('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ').source).toBe(
      'youtube',
    );
    expect(() => videoReference('javascript:alert(1)')).toThrow();
    expect(() => videoReference('https://youtube.com.attacker.test/watch?v=aqz-KE-bpKQ')).toThrow();
  });
});

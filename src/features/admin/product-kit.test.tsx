import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeed } from '@/lib/demo/seed';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import { ProductEditor } from './product-editor';
import { AdminProducts } from './catalog';
import { AdminProduction } from './production';

const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
const adminData = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useAdminAction: () => ({ run, error: '' }),
}));
vi.mock('./admin-frame', () => ({ useAdminData: () => adminData.value }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const seed = () => createSeed();
const pieces = (ops: ReturnType<typeof seed>) => ops.products.filter((p) => !p.kit);
function setData(over: Record<string, unknown> = {}) {
  const ops = seed();
  adminData.value = {
    ...ops,
    products: ops.products,
    workspace: { ...defaultWorkspaceSettings },
    ...over,
  };
  return ops;
}

describe('kit editor', () => {
  beforeEach(() => {
    run.mockClear();
    setData();
  });

  async function startKit(user: ReturnType<typeof userEvent.setup>) {
    const [a, b] = pieces(seed());
    render(<ProductEditor onSuccess={() => {}} />);
    await user.type(screen.getByLabelText('Nome da peça'), 'Kit Presente Especial');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'kit');
    expect(screen.queryByLabelText('Tamanhos (separados por vírgula)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cores (separadas por vírgula)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preço e custo' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar peça' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar peça' }));
    await user.selectOptions(screen.getByLabelText('Peça 1'), a.id);
    await user.selectOptions(screen.getByLabelText('Peça 2'), b.id);
    return { a, b };
  }

  it('saves a kit with its components, price and no per-size pricing', async () => {
    const user = userEvent.setup();
    const { a, b } = await startKit(user);
    const q1 = screen.getByLabelText('Quantidade da peça 1');
    await user.clear(q1);
    await user.type(q1, '2');
    const price = screen.getByLabelText('Preço do kit (R$)');
    await user.clear(price);
    await user.type(price, '179,90');
    const packaging = screen.getByLabelText('Embalagem do kit (R$)');
    await user.clear(packaging);
    await user.type(packaging, '3,00');
    expect(screen.queryByLabelText(/^Preço — /)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Estoque e frete' }));
    expect(screen.getByText('O estoque do kit vem das peças.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unidades disponíveis')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mídia da vitrine' }));
    await user.click(screen.getByRole('button', { name: 'Produto' }));
    await user.selectOptions(screen.getByLabelText('Visibilidade'), 'false');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const saved = run.mock.calls[0][0].product;
    expect(saved.kit.components).toEqual([
      { productId: a.id, sizeIndex: 0, color: null, quantity: 2 },
      { productId: b.id, sizeIndex: 0, color: null, quantity: 1 },
    ]);
    expect(saved.priceCents).toBe(17990);
    expect(saved.costBreakdown.packagingCents).toBe(300);
    expect(saved.sizePrices).toBeUndefined();
    expect(saved.costBySize).toBeUndefined();
    expect(saved.sizes).toEqual(['Kit completo']);
    expect(saved.colors).toEqual(['Padrão']);
  });

  it('warns when the margin falls below the minimum and when the kit loses money', async () => {
    const user = userEvent.setup();
    await startKit(user);
    const price = screen.getByLabelText('Preço do kit (R$)');
    await user.clear(price);
    await user.type(price, '1.000,00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.clear(price);
    await user.type(price, '40,00');
    const alerts = (await screen.findAllByRole('alert')).map((a) => a.textContent);
    expect(alerts).toContain('Margem abaixo da mínima de 20%.');
    await user.clear(price);
    await user.type(price, '0,50');
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent)).toContain(
      'Este kit dá prejuízo.',
    );
  });

  it('shows a Kit badge and no stock control for kits in the product list', () => {
    render(<AdminProducts />);
    const kit = seed().products.find((p) => p.kit)!;
    const row = screen.getByText(kit.name).closest('tr')!;
    expect(within(row).getByText('Kit')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Movimentar' })).not.toBeInTheDocument();
    expect(within(row).getByText('Sob demanda')).toBeInTheDocument();
    const other = seed().products.find((p) => !p.kit)!;
    const otherRow = screen.getByText(other.name).closest('tr')!;
    expect(within(otherRow).getByRole('button', { name: 'Movimentar' })).toBeInTheDocument();
  });

  it('shows the computed availability of a kit when the inventory policy is stock', () => {
    const ops = seed();
    const kit = ops.products.find((p) => p.kit)!;
    const stockOf = (id: string) => ops.products.find((p) => p.id === id)!.stock;
    const expected = Math.min(
      ...kit.kit!.components.map((c) => Math.floor(stockOf(c.productId) / c.quantity)),
    );
    setData({ workspace: { ...defaultWorkspaceSettings, inventoryPolicy: 'stock' } });
    render(<AdminProducts />);
    const row = screen.getByText(kit.name).closest('tr')!;
    expect(within(row).getByText(`Disponível: ${expected} kits`)).toBeInTheDocument();
  });

  it('lists the components of a kit on the production card', () => {
    const ops = seed();
    const job = ops.jobs[0];
    const order = ops.orders.find((o) => o.id === job.orderId)!;
    order.items = [
      {
        ...order.items[0],
        name: 'Kit Oração em Família',
        kit: {
          items: [
            {
              productId: 'a',
              name: 'Cruz',
              size: '20 cm',
              sizeIndex: 1,
              color: 'Marfim',
              quantity: 2,
            },
            {
              productId: 'b',
              name: 'Palavra',
              size: '15 cm',
              sizeIndex: 0,
              color: null,
              quantity: 1,
            },
          ],
        },
      },
    ];
    setData({ ...ops });
    render(<AdminProduction />);
    expect(screen.getAllByText('Kit com 3 peças').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2× Cruz (20 cm · Marfim)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1× Palavra (15 cm · Qualquer cor)').length).toBeGreaterThan(0);
  });
});

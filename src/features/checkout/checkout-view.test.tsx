import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CartItem } from '@/lib/domain/types';
import { ApiError } from '@/lib/api/contracts';
import { useCartStore } from '@/lib/store/cart';
import { CheckoutView } from './checkout-view';

const h = vi.hoisted(() => {
  const customer = {
    name: 'Ana Souza',
    email: 'ana@example.com',
    phone: '(11) 91234-5678',
    cep: '01310-100',
    street: 'Avenida Paulista',
    number: '1000',
    extra: '',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
  };
  const gateway = {
    shipping: vi.fn(),
    estimate: vi.fn(),
    checkout: vi.fn(),
    updateProfile: vi.fn(),
  };
  return { push: vi.fn(), customer, gateway };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/api/query', () => ({
  useGateway: () => h.gateway,
  useSession: () => ({
    data: { role: 'customer', name: h.customer.name, email: h.customer.email },
  }),
  useAccount: () => ({ data: { customer: h.customer } }),
  useEndSession: () => ({ mutate: vi.fn() }),
  useCommand: <I, R>(action: (g: typeof h.gateway, input: I) => Promise<R>) => ({
    mutateAsync: (input: I) => action(h.gateway, input),
    isPending: false,
  }),
}));
Object.defineProperty(window, 'scrollTo', { value: vi.fn() });
vi.mock('@/lib/media/use-asset', () => ({ useAssetUrl: (s?: string) => s }));

const line: CartItem = {
  key: 'p1|Marfim|0|',
  productId: 'p1',
  name: 'Sagrada Família',
  image: '/p1.jpg',
  imageIndex: 0,
  color: 'Marfim',
  size: '15 cm',
  sizeIndex: 0,
  unitCents: 9990,
  quantity: 2,
  dedication: '',
};

async function toPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Continuar para entrega/ }));
  const next = await screen.findByRole('button', { name: /Continuar para pagamento/ });
  await vi.waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  // The payment step reuses the delivery form, which stays disabled until its submit settles.
  const consent = () => screen.getByRole('checkbox', { name: /simulação/ });
  await screen.findByRole('checkbox', { name: /simulação/ });
  await vi.waitFor(async () => {
    if (!(consent() as HTMLInputElement).checked) await user.click(consent());
    expect(consent()).toBeChecked();
  });
}

describe('CheckoutView', () => {
  const clear = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], clear });
    h.gateway.shipping.mockResolvedValue([
      { id: 'standard', label: 'Padrão', estimate: '5 dias', cents: 1890 },
    ]);
    h.gateway.updateProfile.mockResolvedValue(undefined);
    h.gateway.checkout.mockResolvedValue({ orderId: 'ord-1' });
  });

  it('com groupBuy usa só a linha da campanha, sem cupom, e não mexe no carrinho', async () => {
    const user = userEvent.setup();
    useCartStore.setState({ items: [{ ...line, productId: 'outro', key: 'outro' }] });
    render(<CheckoutView groupBuy={{ id: 'grupo-demo', line }} />);
    expect(screen.queryByLabelText('Cupom de desconto')).toBeNull();
    expect(screen.getByText('Sagrada Família')).toBeVisible();
    expect(screen.queryByText('outro')).toBeNull();
    await toPayment(user);
    await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
    await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    const input = h.gateway.checkout.mock.calls[0][0];
    expect(input.groupBuyId).toBe('grupo-demo');
    expect(input.items).toEqual([
      { productId: 'p1', quantity: 2, color: 'Marfim', sizeIndex: 0, dedication: '' },
    ]);
    expect(input.coupon).toBe('');
    expect(h.push).toHaveBeenCalledWith('/checkout/sucesso?pedido=ord-1');
    expect(clear).not.toHaveBeenCalled();
    expect(shippingItems()).toEqual([{ productId: 'p1', quantity: 2, sizeIndex: 0 }]);
  });

  it('mostra mensagem amigável para erros do grupo', async () => {
    const user = userEvent.setup();
    h.gateway.checkout.mockRejectedValue(new ApiError('GROUP_BUY_LIMIT', 'bruto', 422));
    render(<CheckoutView groupBuy={{ id: 'grupo-demo', line }} />);
    await toPayment(user);
    await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
    expect(await screen.findByText(/limite de peças por pessoa/)).toBeVisible();
    expect(clear).not.toHaveBeenCalled();
  });

  it('sem groupBuy mantém o cupom e esvazia o carrinho no sucesso', async () => {
    const user = userEvent.setup();
    useCartStore.setState({ items: [line] });
    render(<CheckoutView />);
    expect(screen.getByLabelText('Cupom de desconto')).toBeVisible();
    await toPayment(user);
    await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
    await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    expect(h.gateway.checkout.mock.calls[0][0].groupBuyId).toBeUndefined();
    expect(clear).toHaveBeenCalled();
  });
});

function shippingItems() {
  return h.gateway.shipping.mock.calls[0][1];
}

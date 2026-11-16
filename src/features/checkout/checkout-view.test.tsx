import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CartItem } from '@/lib/domain/types';
import { ApiError } from '@/lib/api/contracts';
import { useCartStore } from '@/lib/store/cart';
import { MARKETING_CONSENT_TEXT } from '@maos-em-oracao/contracts';
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
    register: vi.fn(),
  };
  // Signed-in customer by default; visitor tests switch this off.
  const state = { visitor: false };
  return { push: vi.fn(), customer, gateway, state };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/api/query', () => ({
  useGateway: () => h.gateway,
  useSession: () => ({
    data: h.state.visitor
      ? null
      : { role: 'customer', name: h.customer.name, email: h.customer.email },
  }),
  useAccount: () => ({ data: h.state.visitor ? undefined : { customer: h.customer } }),
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
    h.state.visitor = false;
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

  it('envia marketingOptIn false quando a caixa de novidades fica desmarcada', async () => {
    const user = userEvent.setup();
    useCartStore.setState({ items: [line] });
    render(<CheckoutView />);
    await toPayment(user);
    const box = screen.getByRole('checkbox', { name: MARKETING_CONSENT_TEXT });
    expect(box).not.toBeChecked();
    expect(box).not.toBeRequired();
    await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
    await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    expect(h.gateway.checkout.mock.calls[0][0].marketingOptIn).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('envia marketingOptIn true quando a caixa de novidades é marcada', async () => {
    const user = userEvent.setup();
    useCartStore.setState({ items: [line] });
    render(<CheckoutView />);
    await toPayment(user);
    await user.click(screen.getByRole('checkbox', { name: MARKETING_CONSENT_TEXT }));
    await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
    await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    expect(h.gateway.checkout.mock.calls[0][0].marketingOptIn).toBe(true);
  });

  describe('visitante (sem sessão)', () => {
    const accountBox = () =>
      screen.getByRole('checkbox', { name: /Quero criar minha conta com este e-mail/ });
    async function fillContact(user: ReturnType<typeof userEvent.setup>) {
      h.state.visitor = true;
      useCartStore.setState({ items: [line] });
      render(<CheckoutView />);
      await user.click(screen.getByRole('button', { name: 'Preencher com dados fictícios' }));
    }

    it('segue como convidado sem senha e sem criar conta', async () => {
      const user = userEvent.setup();
      await fillContact(user);
      // Password inputs have no ARIA role; the visitor must not be asked for one.
      expect(document.querySelector('input[type="password"]')).toBeNull();
      expect(accountBox()).not.toBeChecked();
      expect(
        screen.getByRole('link', { name: /Entre para usar seus dados salvos/ }),
      ).toHaveAttribute('href', '/login?retorno=/checkout');
      await toPayment(user);
      await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
      await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
      expect(h.gateway.register).not.toHaveBeenCalled();
      expect(h.gateway.updateProfile).not.toHaveBeenCalled();
    });

    it('com a caixa marcada pede o link da conta e avisa quando ele sai', async () => {
      const user = userEvent.setup();
      h.gateway.register.mockResolvedValue({ message: 'ok' });
      await fillContact(user);
      await user.click(accountBox());
      await toPayment(user);
      expect(h.gateway.register).toHaveBeenCalledTimes(1);
      expect(h.gateway.register).toHaveBeenCalledWith({
        name: 'Cliente de Demonstração',
        email: 'cliente@exemplo.com',
        marketingOptIn: false,
      });
      expect(screen.getByText(/conta de demonstração foi criada/)).toBeVisible();
      await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
      await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    });

    it('não trava a compra enquanto o cadastro demora', async () => {
      const user = userEvent.setup();
      h.gateway.register.mockReturnValue(new Promise(() => {}));
      await fillContact(user);
      await user.click(accountBox());
      await toPayment(user);
      await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
      await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
    });

    it('uma falha no cadastro não bloqueia a compra nem mostra erro', async () => {
      const user = userEvent.setup();
      h.gateway.register.mockRejectedValue(new ApiError('RATE_LIMITED', 'Muitas tentativas.', 429));
      await fillContact(user);
      await user.click(accountBox());
      await toPayment(user);
      await user.click(screen.getByRole('button', { name: /Concluir demonstração/ }));
      await vi.waitFor(() => expect(h.gateway.checkout).toHaveBeenCalled());
      expect(screen.queryByText(/conta de demonstração foi criada|Enviamos o link/)).toBeNull();
      expect(screen.queryByText('Muitas tentativas.')).toBeNull();
    });
  });
});

function shippingItems() {
  return h.gateway.shipping.mock.calls[0][1];
}

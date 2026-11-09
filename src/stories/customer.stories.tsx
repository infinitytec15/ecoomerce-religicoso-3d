import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AccountView } from '@/features/account/account-view';
import { AccountFrame } from '@/features/account/account-frame';
import { CheckoutView } from '@/features/checkout/checkout-view';
import { CartPage } from '@/features/cart/cart-sheet';
import { CommunityView } from '@/features/community/community-view';
import { SupportView } from '@/features/account/support-view';
import { seedCatalog } from '@/lib/demo/seed';
import { cartLine } from '@/lib/domain/commerce';
const meta = { title: 'Jornadas/Cliente', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const CarrinhoVazio: Story = { render: () => <CartPage /> };
export const CarrinhoComPecas: Story = {
  parameters: { cart: [cartLine(seedCatalog[0])] },
  render: () => <CartPage />,
};
export const CheckoutCompleto: Story = {
  parameters: { cart: [cartLine(seedCatalog[0]), cartLine(seedCatalog[3], 2)] },
  render: () => <CheckoutView />,
};
export const MinhaConta: Story = {
  parameters: { commerceSession: 'customer', nextjs: { navigation: { pathname: '/conta' } } },
  render: () => (
    <AccountFrame>
      <AccountView />
    </AccountFrame>
  ),
};
export const MinhaAssinatura: Story = {
  parameters: {
    commerceSession: 'customer',
    nextjs: { navigation: { pathname: '/conta/assinatura' } },
  },
  render: () => (
    <AccountFrame>
      <AccountView tab="assinatura" />
    </AccountFrame>
  ),
};
export const MeusEnvios: Story = {
  parameters: {
    commerceSession: 'customer',
    nextjs: { navigation: { pathname: '/conta/envios' } },
  },
  render: () => (
    <AccountFrame>
      <AccountView tab="envios" />
    </AccountFrame>
  ),
};
export const MinhasCobrancas: Story = {
  parameters: {
    commerceSession: 'customer',
    nextjs: { navigation: { pathname: '/conta/cobrancas' } },
  },
  render: () => (
    <AccountFrame>
      <AccountView tab="cobrancas" />
    </AccountFrame>
  ),
};
export const MeusAtendimentos: Story = {
  parameters: {
    commerceSession: 'customer',
    nextjs: { navigation: { pathname: '/conta/atendimentos' } },
  },
  render: () => (
    <AccountFrame>
      <AccountView tab="atendimentos" />
    </AccountFrame>
  ),
};
export const MuralPublico: Story = { render: () => <CommunityView /> };
export const CentralDeAjuda: Story = { render: () => <SupportView /> };

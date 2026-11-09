import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthScreen } from '@/features/auth/auth-screen';
import { ClubLanding, SubscriptionCheckout } from '@/features/club/club-view';
import { ShipmentCard } from '@/features/account/shipment-card';
import { PrayerCard } from '@/features/community/community-view';
import { NewsletterContent } from '@/components/faith/faith-features';
import { AdminFrame } from '@/features/admin/admin-frame';
import { AdminOverview } from '@/features/admin/overview';
import { AdminOrders } from '@/features/admin/orders';
import { AdminProduction } from '@/features/admin/production';
import { createSeed, seedSettings } from '@/lib/demo/seed';
const seed = createSeed();
const meta = {
  title: 'Jornadas/Telas',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Telas da aplicação Next.js usando os mesmos componentes, sem iframe ou cópia de HTML. A direção Essência é preservada em desktop e celular. Dados em memória são reiniciados ao trocar de história.',
      },
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoginCliente: Story = { render: () => <AuthScreen /> };
export const LoginEquipe: Story = {
  parameters: { nextjs: { navigation: { pathname: '/admin/login' } } },
  render: () => <AuthScreen kind="staff" />,
};
export const ClubeMensal: Story = { render: () => <ClubLanding initialSettings={seedSettings} /> };
export const AdesaoAoClube: Story = {
  render: () => <SubscriptionCheckout initialSettings={seedSettings} />,
};
export const CaminhoDaCesta: Story = {
  render: () => (
    <div className="container" style={{ maxWidth: 850, padding: 28 }}>
      <ShipmentCard order={seed.orders.find((o) => o.type === 'Clube')!} />
    </div>
  ),
};
export const PedidoDeOracao: Story = {
  render: () => (
    <div style={{ maxWidth: 440, padding: 24 }}>
      <PrayerCard prayer={seed.prayers[0]} />
    </div>
  ),
};
export const ConviteDeOracao: Story = {
  render: () => (
    <div style={{ maxWidth: 950, margin: '30px auto' }}>
      <NewsletterContent onClose={() => {}} />
    </div>
  ),
};
export const GestaoVisaoGeral: Story = {
  parameters: { commerceSession: 'admin', nextjs: { navigation: { pathname: '/admin' } } },
  render: () => (
    <AdminFrame>
      <AdminOverview />
    </AdminFrame>
  ),
};
export const GestaoPedidos: Story = {
  parameters: { commerceSession: 'admin', nextjs: { navigation: { pathname: '/admin/pedidos' } } },
  render: () => (
    <AdminFrame>
      <AdminOrders />
    </AdminFrame>
  ),
};
export const GestaoProducao: Story = {
  parameters: { commerceSession: 'admin', nextjs: { navigation: { pathname: '/admin/producao' } } },
  render: () => (
    <AdminFrame>
      <AdminProduction />
    </AdminFrame>
  ),
};

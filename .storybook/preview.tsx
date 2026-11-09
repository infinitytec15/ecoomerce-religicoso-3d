import type { Preview } from '@storybook/nextjs-vite';
import { useEffect, useState, type ReactNode } from 'react';
import '@/styles/globals.css';
import './fonts.css';
import { CommerceProvider } from '@/lib/api/query';
import { FeedbackProvider } from '@/components/ui/feedback';
import { DemoGateway } from '@/lib/demo/gateway';
import { MemoryDemoStorage } from '@/lib/demo/storage';
import { createSeed, STAFF_PERMISSIONS } from '@/lib/demo/seed';
import type { CartItem, Session } from '@/lib/domain/types';
import { useCartStore } from '@/lib/store/cart';
const emptyCart: CartItem[] = [];
function Environment({
  children,
  role,
  cart = emptyCart,
}: {
  children: ReactNode;
  role?: string;
  cart?: CartItem[];
}) {
  useEffect(() => {
    useCartStore.setState({ items: cart, favorites: [], isOpen: false });
  }, [cart]);
  const [gateway] = useState(() => {
    const seed = createSeed(),
      customer = seed.clients[0];
    const session: Session | null =
      role === 'admin'
        ? {
            id: 'staff-demo',
            name: 'Equipe Mãos em Oração',
            email: 'gestao@maosemoracao.demo',
            role: 'admin',
            permissions: STAFF_PERMISSIONS,
            demo: true,
          }
        : role === 'customer'
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              role: 'customer',
              permissions: [],
              demo: true,
            }
          : null;
    return new DemoGateway(new MemoryDemoStorage(seed, session));
  });
  return (
    <CommerceProvider gateway={gateway}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </CommerceProvider>
  );
}
const preview: Preview = {
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
    controls: { expanded: true },
    a11y: { test: 'error' },
    backgrounds: {
      options: {
        essencia: { name: 'Essência', value: '#faf8f3' },
        olive: { name: 'Oliva', value: '#505845' },
      },
    },
  },
  initialGlobals: { backgrounds: { value: 'essencia' } },
  decorators: [
    (Story, context) => (
      <Environment
        key={context.id}
        role={context.parameters.commerceSession}
        cart={context.parameters.cart}
      >
        <Story />
      </Environment>
    ),
  ],
  tags: ['autodocs'],
};
export default preview;

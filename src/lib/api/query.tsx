'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { CommerceGateway } from './contracts';
import { ApiError } from './contracts';
import { HttpGateway } from './http';
import { createLazyDemoGateway } from './lazy-demo';
import type { Product, StoreSettings } from '@/lib/domain/types';
import { IS_DEMO } from './config';
import defaultSettings from '@/data/public-settings.json';
const GatewayContext = createContext<CommerceGateway | null>(null);
export function CommerceProvider({
  children,
  gateway: provided,
}: {
  children: ReactNode;
  gateway?: CommerceGateway;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000,
            retry: (count, error) =>
              !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [gateway] = useState(
    () => provided || (IS_DEMO ? createLazyDemoGateway() : new HttpGateway()),
  );
  return (
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </GatewayContext.Provider>
  );
}
export function useGateway() {
  const gateway = useContext(GatewayContext);
  if (!gateway) throw new Error('CommerceProvider ausente.');
  return gateway;
}
export const queryKeys = {
  catalog: ['catalog'] as const,
  settings: ['settings'] as const,
  session: ['session'] as const,
  community: ['community'] as const,
  account: (id?: string) => ['account', id] as const,
  admin: (id?: string) => ['admin', id] as const,
  reviews: (productId: string, rating?: number) => ['reviews', productId, rating ?? 'all'] as const,
};
export function useCatalog(initial?: Product[]) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.catalog,
    queryFn: () => gateway.catalog(),
    initialData: initial,
    initialDataUpdatedAt: gateway.mode === 'demo' ? 0 : undefined,
  });
}
export function useSettings(initial: StoreSettings = defaultSettings) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => gateway.settings(),
    initialData: initial,
    initialDataUpdatedAt: gateway.mode === 'demo' ? 0 : undefined,
  });
}
export function useSession() {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => gateway.session(),
    staleTime: 10000,
  });
}
export function useAccount(poll = false) {
  const gateway = useGateway(),
    session = useSession();
  return useQuery({
    queryKey: queryKeys.account(session.data?.id),
    refetchInterval: poll ? 5000 : false,
    queryFn: () => gateway.account(),
    enabled: session.data?.role === 'customer',
  });
}
export function useProductReviews(productId: string, rating?: number) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.reviews(productId, rating),
    queryFn: () => gateway.productReviews(productId, rating),
  });
}
export function useOperations() {
  const gateway = useGateway(),
    session = useSession();
  return useQuery({
    queryKey: queryKeys.admin(session.data?.id),
    refetchInterval: (query) =>
      gateway.mode === 'http'
        ? 10000
        : query.state.data?.products.some(
              (p) =>
                p.model?.status === 'processing' || p.media?.some((m) => m.status === 'processing'),
            )
          ? 5000
          : false,
    queryFn: () => gateway.admin(),
    enabled: !!session.data && session.data.role !== 'customer',
  });
}
export function useCommunity() {
  const gateway = useGateway();
  return useQuery({ queryKey: queryKeys.community, queryFn: () => gateway.community() });
}
export function useCommand<TInput, TResult = void>(
  action: (gateway: CommerceGateway, input: TInput) => Promise<TResult>,
) {
  const gateway = useGateway(),
    client = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => action(gateway, input),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
  });
}
export function useEndSession() {
  const gateway = useGateway(),
    client = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.logout(),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ['account'] });
      client.removeQueries({ queryKey: ['admin'] });
      await client.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

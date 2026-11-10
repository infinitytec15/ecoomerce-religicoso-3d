'use client';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { HttpClient } from '@/lib/api/http';
import { useGateway, useSession } from '@/lib/api/query';
const count = z.number().int();
export const overviewSchema = z.object({
  ordersInProgress: count,
  activeSubscriptions: count,
  mrrCents: count,
  pendingCents: count,
  pendingCharges: count,
  productionOpen: count,
  supportOpen: count,
  grossCents: count,
  refundsCents: count,
  expensesCents: count,
  netCents: count,
  paidCount: count,
  distribution: z.array(z.object({ method: z.string(), cents: count, count })),
  pipeline: z.array(z.object({ status: z.string(), count })),
  daily: z.array(z.object({ date: z.string(), income: count, expense: count, orders: count })),
  period: z.object({ from: z.string(), to: z.string() }),
});
export function useAdminOverview(filters: Record<string, string> = {}) {
  const gateway = useGateway(),
    session = useSession();
  return useQuery({
    queryKey: ['admin', session.data?.id, 'overview', filters],
    queryFn: () =>
      new HttpClient().request('admin/overview?' + new URLSearchParams(filters), overviewSchema),
    enabled: gateway.mode === 'http' && !!session.data && session.data.role !== 'customer',
    refetchInterval: 10000,
  });
}

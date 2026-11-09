import { AdminOrders } from '@/features/admin/orders';
export default async function Page({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  return <AdminOrders initialCreate={(await searchParams).novo === '1'} />;
}

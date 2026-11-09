import { AdminOrderDetail } from '@/features/admin/orders';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminOrderDetail id={(await params).id} />;
}

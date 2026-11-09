import { AdminSubscriptionDetail } from '@/features/admin/subscriptions';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminSubscriptionDetail id={(await params).id} />;
}

import { AdminSupport } from '@/features/admin/service';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminSupport id={(await params).id} />;
}

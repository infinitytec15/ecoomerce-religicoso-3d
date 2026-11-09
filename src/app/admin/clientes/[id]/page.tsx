import { AdminCustomerDetail } from '@/features/admin/customers';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminCustomerDetail id={(await params).id} />;
}

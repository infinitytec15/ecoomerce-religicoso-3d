import { AdminSearch } from '@/features/admin/service';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <AdminSearch query={(await searchParams).q || ''} />;
}

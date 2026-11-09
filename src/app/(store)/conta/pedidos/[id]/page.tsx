import { AccountView } from '@/features/account/account-view';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AccountView tab="pedido" id={(await params).id} />;
}

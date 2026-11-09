import { SuccessView } from '@/features/checkout/success-view';
export const metadata = { title: 'Seu pedido' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  return <SuccessView orderId={(await searchParams).pedido} />;
}

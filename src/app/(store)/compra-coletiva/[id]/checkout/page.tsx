import { notFound } from 'next/navigation';
import { CheckoutView } from '@/features/checkout/checkout-view';
import { getServerGroupBuy } from '@/lib/api/server';
import { groupBuyCheckoutLine } from '@/features/group-buys/checkout-line';
export const metadata = { title: 'Finalizar compra coletiva' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]),
    gb = await getServerGroupBuy(id);
  if (!gb) notFound();
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');
  return (
    <CheckoutView
      groupBuy={{ id: gb.id, line: groupBuyCheckoutLine(gb, one('cor'), Number(one('qtd'))) }}
    />
  );
}

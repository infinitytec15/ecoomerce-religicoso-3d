import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GroupBuyDetail } from '@/features/group-buys/group-buy-detail';
import { getServerGroupBuy } from '@/lib/api/server';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const gb = await getServerGroupBuy((await params).id);
  return gb
    ? { title: gb.title, description: gb.description || gb.productName }
    : { title: 'Compra coletiva não encontrada' };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const gb = await getServerGroupBuy((await params).id);
  if (!gb) notFound();
  return <GroupBuyDetail groupBuy={gb} />;
}

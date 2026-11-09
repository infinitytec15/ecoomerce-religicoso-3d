import { notFound } from 'next/navigation';
import { SupportView } from '@/features/account/support-view';
export default async function Page({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!['entrega', 'trocas', 'cuidados', 'privacidade'].includes(topic)) notFound();
  return <SupportView topic={topic} />;
}

import { TokenAction } from '@/features/auth/token-action';
export const metadata = {
  title: 'Pedidos de avaliação',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <TokenAction mode="reviewOptOut" token={(await searchParams).token || ''} />;
}

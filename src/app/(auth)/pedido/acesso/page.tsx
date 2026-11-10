import { TokenAction } from '@/features/auth/token-action';
export const metadata = {
  title: 'Acessar meu pedido · Mãos em Oração',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <TokenAction mode="guest" token={(await searchParams).token || ''} />;
}

import { TokenAction } from '@/features/auth/token-action';
export const metadata = {
  title: 'Confirmar e-mail · Mãos em Oração',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; purpose?: string }>;
}) {
  const q = await searchParams;
  return <TokenAction mode="verify" token={q.token || ''} purpose={q.purpose} />;
}

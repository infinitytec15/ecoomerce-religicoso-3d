import { TokenAction } from '@/features/auth/token-action';
export const metadata = {
  title: 'Criar nova senha',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; kind?: string }>;
}) {
  const q = await searchParams;
  return <TokenAction mode="reset" token={q.token || ''} staff={q.kind === 'staff'} />;
}

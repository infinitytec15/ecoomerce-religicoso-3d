import { TokenAction } from '@/features/auth/token-action';
export const metadata = {
  title: 'Confirmar oração diária',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <TokenAction mode="prayer" token={(await searchParams).token || ''} />;
}

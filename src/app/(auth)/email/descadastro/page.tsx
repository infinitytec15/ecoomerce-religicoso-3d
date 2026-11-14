import { MarketingUnsubscribe } from '@/features/account/marketing-unsubscribe';
export const metadata = {
  title: 'Descadastro de novidades',
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; c?: string }>;
}) {
  const { token, c } = await searchParams;
  return <MarketingUnsubscribe token={token || ''} campaignId={c || undefined} />;
}

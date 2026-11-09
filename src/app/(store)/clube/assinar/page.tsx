import { SubscriptionCheckout } from '@/features/club/club-view';
import { getServerSettings } from '@/lib/api/server';
export const metadata = { title: 'Assinar o clube' };
export default async function Page() {
  return <SubscriptionCheckout initialSettings={await getServerSettings()} />;
}

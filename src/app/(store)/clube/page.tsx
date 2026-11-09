import { ClubLanding } from '@/features/club/club-view';
import { getServerSettings } from '@/lib/api/server';
export const metadata = { title: 'Clube Cesta com Jesus' };
export default async function Page() {
  return <ClubLanding initialSettings={await getServerSettings()} />;
}

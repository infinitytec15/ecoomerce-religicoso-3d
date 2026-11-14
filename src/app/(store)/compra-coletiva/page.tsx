import { GroupBuyList } from '@/features/group-buys/group-buy-list';
import { getServerGroupBuys } from '@/lib/api/server';
export const metadata = {
  title: 'Compra coletiva',
  description: 'Junte-se ao grupo e garanta o preço de grupo nas peças em campanha.',
};
export default async function Page() {
  return (
    <main id="main" className="container page-top">
      <h1>Compra coletiva</h1>
      <GroupBuyList groupBuys={await getServerGroupBuys()} />
    </main>
  );
}

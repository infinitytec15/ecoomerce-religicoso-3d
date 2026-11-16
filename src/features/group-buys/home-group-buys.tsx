import Link from 'next/link';
import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import { Icon } from '@/components/ui/icon';
import { GroupBuyList } from './group-buy-list';

const HOME_LIMIT = 3;

/** Open group-buy campaigns on the home page; nothing at all when none is open. */
export function HomeGroupBuys({ groupBuys }: { groupBuys: GroupBuyPublic[] }) {
  if (!groupBuys.length) return null;
  return (
    <section className="container faith-group-buys" aria-labelledby="home-group-buys-title">
      <div className="section-header">
        <div>
          <h2 id="home-group-buys-title">Compras coletivas abertas</h2>
          <p>Junte-se ao grupo e garanta o preço de grupo nas peças em campanha.</p>
        </div>
        <Link className="arrow-link" href="/compra-coletiva">
          Ver todas as campanhas <Icon name="arrow" />
        </Link>
      </div>
      <GroupBuyList groupBuys={groupBuys.slice(0, HOME_LIMIT)} />
    </section>
  );
}

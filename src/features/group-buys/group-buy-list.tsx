import Link from 'next/link';
import type { GroupBuyPublic } from '@maos-em-oracao/contracts';
import { ProductImage } from '@/components/ui/product-image';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { groupBuyUrl } from '@/lib/seo/site-url';
import { GroupBuyBlock } from './group-buy-block';

export function GroupBuyList({ groupBuys }: { groupBuys: GroupBuyPublic[] }) {
  if (!groupBuys.length)
    return (
      <EmptyState
        title="Nenhuma compra coletiva aberta agora."
        description="Novas campanhas aparecem por aqui. Enquanto isso, conheça as peças da loja."
        action={<ButtonLink href="/produtos">Ver as peças</ButtonLink>}
      />
    );
  return (
    <div className="group-buy-list">
      {groupBuys.map((gb) => (
        <article className="group-buy-card" key={gb.id}>
          <Link href={'/compra-coletiva/' + gb.id} aria-label={'Ver ' + gb.title}>
            <ProductImage src={gb.productImage} alt={gb.productName} />
          </Link>
          <div className="group-buy-card-body">
            <h2>
              <Link href={'/compra-coletiva/' + gb.id}>{gb.title}</Link>
            </h2>
            <small className="muted">
              {gb.productName} · {gb.size}
            </small>
            <GroupBuyBlock
              groupBuy={gb}
              href={'/compra-coletiva/' + gb.id}
              shareUrl={groupBuyUrl(gb.id)}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

'use client';
import Image from 'next/image';
import type { StoreSettings } from '@/lib/domain/types';
import { useSettings } from '@/lib/api/query';
import { money } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
export function HomeClubBanner({ initialSettings }: { initialSettings: StoreSettings }) {
  const { data = initialSettings } = useSettings(initialSettings);
  return (
    <section className="container home-club-banner">
      <div>
        <h2>
          Todo mês, uma nova cesta.
          <br />
          <em>O mesmo amor por Cristo.</em>
        </h2>
        <p>
          {data.clubName} · {money(data.priceCents)}/mês com frete incluído
          {IS_DEMO ? ' no plano demonstrativo' : ''}.
        </p>
        <ButtonLink href="/clube" variant="light">
          Conhecer o clube <Icon name="arrow" />
        </ButtonLink>
      </div>
      <div className="club-banner-image">
        <Image
          src="/assets/club-basket.webp"
          alt="Cesta mensal conceitual de peças cristãs"
          fill
          sizes="(max-width:760px) 100vw, 50vw"
        />
      </div>
    </section>
  );
}

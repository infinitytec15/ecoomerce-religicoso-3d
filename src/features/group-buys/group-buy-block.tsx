import { endsInLabel, type GroupBuySummary } from '@maos-em-oracao/contracts';
import { money } from '@/lib/domain/format';
import { ButtonLink } from '@/components/ui/button';
import { ShareButtons } from './share-buttons';

const closingDate = (endsAt: string) =>
  new Date(endsAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

function modeText(gb: GroupBuySummary) {
  if (gb.mode === 'hold')
    return `Pague ${money(gb.groupPriceCents)}. Se o grupo não fechar até ${closingDate(gb.endsAt)}, devolvemos tudo.`;
  if (gb.goalReached) return 'Meta batida: o preço de grupo já vale para você.';
  return `Pague ${money(gb.normalPriceCents)} agora e receba de volta ${money(gb.normalPriceCents - gb.groupPriceCents)} por peça quando o grupo fechar.`;
}

export function GroupBuyBlock({
  groupBuy: gb,
  href,
  shareUrl,
  now = new Date(),
}: {
  groupBuy: GroupBuySummary;
  href: string;
  shareUrl: string;
  now?: Date;
}) {
  const progress = gb.goal > 0 ? Math.min(100, Math.round((gb.participants / gb.goal) * 100)) : 0;
  return (
    <section className="group-buy-block" aria-label="Compra coletiva">
      <h2>Compra coletiva</h2>
      <p className="group-buy-count">
        {`${gb.participants} de ${gb.goal} · ${
          gb.goalReached ? 'meta batida!' : `faltam ${gb.remaining}`
        } · ${endsInLabel(gb.endsAt, now)}`}
      </p>
      <div
        className="group-buy-bar"
        role="progressbar"
        aria-label="Progresso do grupo"
        aria-valuemin={0}
        aria-valuenow={gb.participants}
        aria-valuemax={gb.goal}
      >
        <i style={{ width: progress + '%' }} />
      </div>
      {gb.initials.length > 0 && (
        <ul className="group-buy-avatars" aria-label="Quem já entrou">
          {gb.initials.slice(0, 8).map((initials, i) => (
            <li key={i}>{initials}</li>
          ))}
        </ul>
      )}
      <p className="group-buy-price">
        <strong>{money(gb.groupPriceCents)} no grupo</strong> <s>{money(gb.normalPriceCents)}</s>
      </p>
      <p className="group-buy-mode">{modeText(gb)}</p>
      <ButtonLink href={href}>Entrar no grupo</ButtonLink>
      <ShareButtons url={shareUrl} text={`Entre na compra coletiva: ${gb.title}`} />
    </section>
  );
}

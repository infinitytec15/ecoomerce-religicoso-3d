'use client';
import { useState } from 'react';
import {
  CRM_LIMITS,
  describeRule,
  percent,
  type AdminMarketingCampaign,
  type MarketingBlockInput,
} from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { AdminMetrics } from '../shared';
import { formatBrasilia } from './time';
import { useGuardedRun } from './use-guarded-run';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';

const CANCELLABLE: AdminMarketingCampaign['state'][] = ['Agendada', 'Enviando'];

export const campaignDate = (c: AdminMarketingCampaign) =>
  formatBrasilia(c.finishedAt ?? c.startedAt ?? c.scheduledAt ?? c.createdAt);

export function CampaignSummary({
  campaign,
  onDone,
}: {
  campaign: AdminMarketingCampaign;
  onDone: () => void;
}) {
  const { products } = useAdminData(),
    guarded = useGuardedRun(),
    [confirming, setConfirming] = useState(false),
    m = campaign.metrics,
    names = Object.fromEntries(products.map((p) => [p.id, p.name]));
  async function duplicate() {
    const copy = {
      name: `Cópia de ${campaign.name}`.slice(0, CRM_LIMITS.name),
      subject: campaign.subject,
      previewText: campaign.previewText,
      segment: { rules: campaign.segment.rules },
      blocks: campaign.blocks.map((block) =>
        block.type === 'image' && !block.href ? { ...block, href: undefined } : block,
      ) as MarketingBlockInput[],
    };
    if (await guarded.go({ type: 'crm.campaign.save', campaign: copy }, 'Rascunho criado.'))
      onDone();
  }
  return (
    <div className="stack">
      <p>
        <StatusBadge status={campaign.state} /> {campaignDate(campaign)}
      </p>
      <p>
        <strong>{campaign.name}</strong>
        <br />
        Assunto: {campaign.subject}
      </p>
      <AdminMetrics
        items={[
          { label: 'Público', value: m.audience, note: 'Pessoas escolhidas no envio' },
          { label: 'Entregues', value: m.delivered, note: `${m.sent} enviados` },
          {
            label: 'Aberturas',
            value: percent(m.opened, m.delivered),
            note: `${m.opened} aberturas`,
          },
          {
            label: 'Cliques',
            value: percent(m.clicked, m.delivered),
            note: `${m.clicked} cliques`,
          },
          { label: 'Descadastros', value: m.unsubscribed, note: 'Pediram para sair' },
          { label: 'Bounces', value: m.bounced, note: 'E-mails que não chegaram' },
        ]}
      />
      <div>
        <strong>Público</strong>
        {campaign.segment.rules.length ? (
          <ul>
            {campaign.segment.rules.map((rule, index) => (
              <li key={index}>{describeRule(rule, { products: names })}</li>
            ))}
          </ul>
        ) : (
          <p>Todos que podem receber</p>
        )}
      </div>
      {guarded.error && (
        <p className="form-error" role="alert">
          {guarded.error}
        </p>
      )}
      <div className="row wrap">
        {CANCELLABLE.includes(campaign.state) && (
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Cancelar envio
          </Button>
        )}
        <Button type="button" disabled={guarded.pending} onClick={() => void duplicate()}>
          Duplicar como rascunho
        </Button>
      </div>
      <Modal open={confirming} onOpenChange={setConfirming} title="Cancelar envio">
        <p>
          Cancelar “{campaign.name}”? Quem já recebeu continua com o e-mail; os demais não recebem.
        </p>
        <div className="row wrap">
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
            Voltar
          </Button>
          <Button
            type="button"
            loading={guarded.pending}
            onClick={async () => {
              const ok = await guarded.go(
                { type: 'crm.campaign.cancel', id: campaign.id },
                'Envio cancelado.',
              );
              setConfirming(false);
              if (ok) onDone();
            }}
          >
            Sim, cancelar envio
          </Button>
        </div>
      </Modal>
    </div>
  );
}

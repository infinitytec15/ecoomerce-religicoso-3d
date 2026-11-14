'use client';
import { percent, type AdminMarketingCampaign } from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { CampaignEditor } from './campaign-editor';
import { CampaignSummary, campaignDate } from './campaign-summary';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';

/** 'new' opens an empty editor; any other string is the id of the campaign to open. */
export type CampaignTarget = string | null;

function audienceLabel(c: AdminMarketingCampaign) {
  if (c.state === 'Rascunho') return c.segment.rules.length ? 'Segmento' : 'Todos';
  return c.metrics.audience;
}

export function CampaignsTab({
  target,
  onTarget,
}: {
  target: CampaignTarget;
  onTarget: (target: CampaignTarget) => void;
}) {
  const { crm } = useAdminData(),
    campaigns = [...crm.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    open = target && target !== 'new' ? campaigns.find((c) => c.id === target) : undefined,
    isOpen = target === 'new' || !!open,
    title =
      target === 'new'
        ? 'Nova campanha'
        : open?.state === 'Rascunho'
          ? 'Editar campanha'
          : 'Resumo da campanha';
  return (
    <>
      <DataTable
        caption="Campanhas de e-mail"
        rows={campaigns}
        columns={[
          {
            key: 'name',
            label: 'Campanha',
            render: (c) => (
              <Button type="button" variant="text" className="small" onClick={() => onTarget(c.id)}>
                {c.name}
              </Button>
            ),
          },
          { key: 'state', label: 'Estado', render: (c) => <StatusBadge status={c.state} /> },
          { key: 'date', label: 'Data', render: campaignDate },
          { key: 'audience', label: 'Público', render: audienceLabel },
          { key: 'delivered', label: 'Entregues', render: (c) => c.metrics.delivered },
          {
            key: 'opened',
            label: 'Aberturas',
            render: (c) => percent(c.metrics.opened, c.metrics.delivered),
          },
          { key: 'clicked', label: 'Cliques', render: (c) => c.metrics.clicked },
          { key: 'unsubscribed', label: 'Descadastros', render: (c) => c.metrics.unsubscribed },
          { key: 'bounced', label: 'Bounces', render: (c) => c.metrics.bounced },
        ]}
      />
      <Modal
        open={isOpen}
        onOpenChange={(next) => !next && onTarget(null)}
        title={title}
        className="admin-record-drawer"
      >
        {target === 'new' && <CampaignEditor key="new" onDone={() => onTarget(null)} />}
        {open &&
          (open.state === 'Rascunho' ? (
            <CampaignEditor key={open.id} campaign={open} onDone={() => onTarget(null)} />
          ) : (
            <CampaignSummary key={open.id} campaign={open} onDone={() => onTarget(null)} />
          ))}
      </Modal>
    </>
  );
}

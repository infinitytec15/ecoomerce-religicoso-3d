'use client';
import { useState, type ReactNode } from 'react';
import { useAdminData } from '../admin-frame';
import { AdminHeading, AdminMetrics } from '../shared';
import { CampaignsTab, type CampaignTarget } from './campaigns';
import { ContactsTab } from './contacts';
import { CrmSettings } from './settings';
import { Button } from '@/components/ui/button';

export const CRM_TABS: { id: string; label: string; render: () => ReactNode }[] = [
  {
    id: 'contacts',
    label: 'Contatos e grupos',
    render: () => <ContactsTab />,
  },
  { id: 'settings', label: 'Configurações', render: () => <CrmSettings /> },
];

export function CrmManager() {
  const { crm } = useAdminData(),
    [tab, setTab] = useState('campaigns'),
    [target, setTarget] = useState<CampaignTarget>(null),
    sent = crm.campaigns.filter((c) => c.state === 'Enviada' || c.state === 'Parcial').length,
    tabs = [
      {
        id: 'campaigns',
        label: 'Campanhas',
        render: () => <CampaignsTab target={target} onTarget={setTarget} />,
      },
      ...CRM_TABS,
    ];
  return (
    <>
      <AdminHeading
        title="E-mail marketing"
        description="Campanhas de e-mail para quem autorizou receber novidades, com público, teste, agendamento e resultados."
        actions={
          <Button
            type="button"
            onClick={() => {
              setTab('campaigns');
              setTarget('new');
            }}
          >
            Nova campanha
          </Button>
        }
      />
      <AdminMetrics
        items={[
          {
            label: 'Podem receber',
            value: crm.totals.eligible,
            note: 'Contatos com aceite registrado',
          },
          { label: 'Descadastrados', value: crm.totals.unsubscribed, note: 'Pediram para sair' },
          { label: 'Campanhas enviadas', value: sent, note: 'Enviadas ou parcialmente enviadas' },
        ]}
      />
      <p className="admin-note">
        Aberturas e cliques dependem do rastreamento ligado no Resend; alguns programas de e-mail
        bloqueiam a contagem de aberturas.
      </p>
      <div className="tabs row wrap" role="tablist" aria-label="Áreas do e-mail marketing">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`crm-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`crm-panel-${t.id}`}
            className={tab === t.id ? 'active' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs
        .filter((t) => t.id === tab)
        .map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`crm-panel-${t.id}`}
            aria-labelledby={`crm-tab-${t.id}`}
          >
            {t.render()}
          </div>
        ))}
    </>
  );
}

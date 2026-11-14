'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  CRM_LIMITS,
  estimateDuration,
  type AdminMarketingCampaign,
} from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { useAdminAction } from '../shared';
import { brasiliaToIso, nowBrasilia } from './time';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { errorMessage, type CrmPreview } from '@/lib/api/contracts';
import { useGateway } from '@/lib/api/query';

type Campaign = Pick<AdminMarketingCampaign, 'id' | 'name' | 'segment'>;
interface ActionProps {
  campaign: Campaign;
  open: boolean;
  onClose: () => void;
}

const emailCheck = z.email();

export function TestSendModal({ campaign, open, onClose }: ActionProps) {
  const action = useAdminAction(),
    [text, setText] = useState('');
  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Enviar teste">
      <Form
        onSubmit={async () => {
          const extra = [...new Set(text.split(/[\s,;]+/).filter(Boolean))].map((e) =>
            e.toLowerCase(),
          );
          if (extra.length > CRM_LIMITS.testRecipients)
            throw new Error(`Informe no máximo ${CRM_LIMITS.testRecipients} e-mails extras.`);
          const bad = extra.find((e) => !emailCheck.safeParse(e).success);
          if (bad) throw new Error(`“${bad}” não é um e-mail válido.`);
          await action.run({ type: 'crm.campaign.test', id: campaign.id, extra }, 'Teste enviado.');
          onClose();
        }}
      >
        {(pending) => (
          <>
            <p>Também vai para o seu e-mail.</p>
            <label>
              E-mails extras (até {CRM_LIMITS.testRecipients}, separados por vírgula ou linha)
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="row wrap">
              <Button type="button" variant="secondary" onClick={onClose}>
                Voltar
              </Button>
              <Button loading={pending}>Enviar teste</Button>
            </div>
          </>
        )}
      </Form>
    </Modal>
  );
}

function ScheduleForm({
  campaign,
  onClose,
  onScheduled,
}: Omit<ActionProps, 'open'> & { onScheduled: () => void }) {
  const action = useAdminAction(),
    gateway = useGateway(),
    { crm } = useAdminData(),
    [mode, setMode] = useState<'now' | 'later'>('now'),
    [when, setWhen] = useState(''),
    [count, setCount] = useState<{ data?: CrmPreview; error?: string }>({});
  useEffect(() => {
    let live = true;
    gateway.crmPreview(campaign.segment).then(
      (data) => live && setCount({ data }),
      (e) => live && setCount({ error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [gateway, campaign.segment]);
  const { data } = count;
  return (
    <Form
      onSubmit={async () => {
        let at: string | null = null;
        if (mode === 'later') {
          at = brasiliaToIso(when);
          if (!at) throw new Error('Informe a data e a hora do envio.');
        }
        await action.run(
          { type: 'crm.campaign.schedule', id: campaign.id, at },
          at ? 'Campanha agendada.' : 'Envio iniciado.',
        );
        onScheduled();
      }}
    >
      {(pending) => (
        <>
          <p role="status">
            {count.error
              ? `Não foi possível calcular o público: ${count.error}`
              : data
                ? `${data.total} pessoas vão receber (${data.consent} por aceite, ${data.legitimateInterest} por legítimo interesse) · envio em ${estimateDuration(data.total, crm.settings.hourlyLimit)}`
                : 'Calculando o público…'}
          </p>
          <label className="row">
            <input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} />
            Enviar agora
          </label>
          <label className="row">
            <input type="radio" checked={mode === 'later'} onChange={() => setMode('later')} />
            Agendar
          </label>
          {mode === 'later' && (
            <label>
              Data e hora (horário de Brasília)
              <input
                type="datetime-local"
                min={nowBrasilia()}
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
          )}
          <div className="row wrap">
            <Button type="button" variant="secondary" onClick={onClose}>
              Voltar
            </Button>
            <Button loading={pending}>
              {mode === 'now' ? 'Confirmar envio' : 'Confirmar agendamento'}
            </Button>
          </div>
        </>
      )}
    </Form>
  );
}

export function ScheduleModal({
  campaign,
  open,
  onClose,
  onScheduled,
}: ActionProps & { onScheduled: () => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Agendar campanha"
      description={`Campanha “${campaign.name}”. Depois de iniciado, o envio só pode ser cancelado.`}
    >
      {open && <ScheduleForm campaign={campaign} onClose={onClose} onScheduled={onScheduled} />}
    </Modal>
  );
}

export function DeleteModal({
  campaign,
  open,
  onClose,
  onDeleted,
}: ActionProps & { onDeleted: () => void }) {
  const action = useAdminAction();
  return (
    <Modal open={open} onOpenChange={(next) => !next && onClose()} title="Excluir campanha">
      <Form
        onSubmit={async () => {
          await action.run({ type: 'crm.campaign.delete', id: campaign.id }, 'Campanha excluída.');
          onDeleted();
        }}
      >
        {(pending) => (
          <>
            <p>Excluir o rascunho “{campaign.name}”? Essa ação não pode ser desfeita.</p>
            <div className="row wrap">
              <Button type="button" variant="secondary" onClick={onClose}>
                Voltar
              </Button>
              <Button loading={pending}>Excluir campanha</Button>
            </div>
          </>
        )}
      </Form>
    </Modal>
  );
}

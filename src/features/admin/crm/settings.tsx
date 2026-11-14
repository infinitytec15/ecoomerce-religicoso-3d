'use client';
import { useState } from 'react';
import { crmSettingsSchema } from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import { useAdminAction } from '../shared';
import { Button } from '@/components/ui/button';
import { Form, text, number } from '@/components/ui/form';
import { useSession } from '@/lib/api/query';

export function CrmSettings() {
  const { crm } = useAdminData(),
    isOwner = !!useSession().data?.owner,
    action = useAdminAction(),
    stored = crm.settings,
    [legit, setLegit] = useState(stored.legitimateInterest);
  return (
    <Form
      className="stack admin-form"
      onSubmit={async (d) => {
        const settings = crmSettingsSchema.parse({
          senderName: text(d, 'senderName'),
          replyTo: text(d, 'replyTo'),
          footerText: text(d, 'footerText'),
          hourlyLimit: number(d, 'hourlyLimit'),
          // The server answers 403 when a non-owner changes this, so they always send the stored value.
          legitimateInterest: isOwner ? legit : stored.legitimateInterest,
        });
        await action.run({ type: 'crm.settings', settings }, 'Configurações salvas.');
      }}
    >
      {(pending) => (
        <>
          <label>
            Nome do remetente
            <input name="senderName" defaultValue={stored.senderName} maxLength={80} required />
          </label>
          <label>
            Responder para
            <input name="replyTo" type="email" defaultValue={stored.replyTo} maxLength={254} />
          </label>
          <label>
            Texto do rodapé
            <textarea
              name="footerText"
              rows={3}
              defaultValue={stored.footerText}
              maxLength={300}
              required
            />
          </label>
          <label>
            Limite de envios por hora
            <input
              name="hourlyLimit"
              type="number"
              min={10}
              max={1800}
              step={1}
              defaultValue={stored.hourlyLimit}
              required
            />
          </label>
          <small>Confira a cota do seu plano no Resend.</small>
          <label className="row">
            <input
              type="checkbox"
              role="switch"
              checked={isOwner ? legit : stored.legitimateInterest}
              disabled={!isOwner}
              onChange={(e) => setLegit(e.target.checked)}
            />
            Incluir clientes que já compraram (legítimo interesse)
          </label>
          <small>
            Clientes que compraram e não marcaram o aceite passam a receber, sempre com descadastro.
            {!isOwner && ' Só o dono da loja pode mudar.'}
          </small>
          <div className="row wrap">
            <Button loading={pending}>Salvar</Button>
          </div>
        </>
      )}
    </Form>
  );
}

'use client';
import { useState } from 'react';
import type { Address, FaithProfile, Subscription, SubscriptionChange } from '@/lib/domain/types';
import { useCommand } from '@/lib/api/query';
import { money } from '@/lib/domain/format';
import { Form, text } from '@/components/ui/form';
import { AddressFields } from '@/components/ui/address-fields';
import { Button } from '@/components/ui/button';
import { useNotify } from '@/components/ui/feedback';
export function SubscriptionPreferences({
  subscription: s,
  onSuccess,
}: {
  subscription: Subscription;
  onSuccess?: () => void;
}) {
  const [address, setAddress] = useState<Address>(s.address),
    change = useCommand((g, input: SubscriptionChange) => g.changeSubscription(input)),
    notify = useNotify();
  return (
    <Form
      onSubmit={async (d) => {
        await change.mutateAsync({
          id: s.id,
          action: 'preferences',
          profile: text(d, 'profile') as FaithProfile,
          finish: text(d, 'finish'),
          payment: text(d, 'payment') as 'card' | 'pix',
          address,
        });
        notify('Preferências salvas para os próximos envios.');
        onSuccess?.();
      }}
    >
      {(pending) => (
        <>
          <div className="form-grid">
            <label>
              Perfil
              <select name="profile" defaultValue={s.profile}>
                {['Católica', 'Evangélica', 'Cristã'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Acabamento
              <select name="finish" defaultValue={s.finish}>
                {['Marfim', 'Terracota', 'Surpresa'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="span2">
              Pagamento dos próximos ciclos
              <select name="payment" defaultValue={s.payment}>
                <option value="card">Cartão</option>
                <option value="pix">Pix mensal</option>
              </select>
            </label>
          </div>
          <AddressFields value={address} onChange={setAddress} showDemo={false} />
          <div className="notice">
            Alterações valem para envios ainda não despachados. A mensalidade contratada permanece{' '}
            {money(s.priceCents)}.
          </div>
          <Button loading={pending}>Salvar preferências</Button>
        </>
      )}
    </Form>
  );
}

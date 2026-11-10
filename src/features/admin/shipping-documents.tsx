'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { HttpClient } from '@/lib/api/http';
import { Form, text } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/domain/format';
const schema = z.object({
  state: z.string(),
  quote: z.object({ carrier: z.string(), cents: z.number(), expiresAt: z.string() }).nullable(),
  fiscal: z.unknown().nullable(),
  labelUrl: z.string().nullable(),
});
export function ShippingDocuments({ orderId }: { orderId: string }) {
  const cache = useQueryClient(),
    query = useQuery({
      queryKey: ['admin', 'shipment', orderId],
      queryFn: () => new HttpClient().request('admin/orders/' + orderId + '/shipment', schema),
      refetchInterval: 5000,
    });
  return (
    <div className="stack">
      {query.error && (
        <p className="form-error" role="alert">
          {query.error.message}
        </p>
      )}
      {query.data?.quote && (
        <p>
          <strong>Custo da etiqueta: {money(query.data.quote.cents)}</strong>
          <br />
          {query.data.quote.carrier} · cotação válida até{' '}
          {new Date(query.data.quote.expiresAt).toLocaleString('pt-BR')}
        </p>
      )}
      <p>Situação: {stateLabels[query.data?.state || ''] || 'Consultando'}</p>
      {query.data?.state === 'prepared' && (
        <Form
          onSubmit={async (d) => {
            const invoiceKey = text(d, 'invoiceKey').replace(/\D/g, '');
            await new HttpClient().request('admin/orders/' + orderId + '/fiscal', z.void(), {
              method: 'PATCH',
              body: invoiceKey ? { invoiceKey } : { nonCommercial: true },
            });
            await cache.invalidateQueries({ queryKey: ['admin', 'shipment', orderId] });
          }}
        >
          {(pending) => (
            <>
              <label>
                Chave de acesso da NF-e
                <input
                  name="invoiceKey"
                  inputMode="numeric"
                  pattern="[0-9]{44}"
                  maxLength={44}
                  placeholder="44 dígitos"
                />
              </label>
              <label className="check">
                <input type="checkbox" name="confirm" required />
                Conferi a documentação. Sem NF-e, declaro que esta remessa se enquadra na declaração
                de conteúdo não comercial.
              </label>
              <Button variant="secondary" className="small" loading={pending}>
                Salvar documentação
              </Button>
              {!!query.data?.fiscal && <span role="status">Documentação salva.</span>}
            </>
          )}
        </Form>
      )}
      {query.data?.labelUrl && (
        <a className="admin-link" href={query.data.labelUrl} target="_blank" rel="noreferrer">
          Abrir etiqueta oficial
        </a>
      )}
    </div>
  );
}

const stateLabels: Record<string, string> = {
  'not-prepared': 'Não preparado',
  prepared: 'Preparado para compra',
  creating: 'Criando envio',
  created: 'Aguardando compra',
  purchasing: 'Confirmando compra',
  purchased: 'Compra confirmada',
  generating: 'Gerando etiqueta',
  ready: 'Etiqueta pronta',
  posted: 'Postado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  create_unknown: 'Conferência necessária',
  purchase_unknown: 'Conferência necessária',
};

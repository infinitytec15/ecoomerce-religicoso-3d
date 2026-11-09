'use client';
import { useState } from 'react';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import type { PaymentToken } from '@/lib/domain/types';
import { money } from '@/lib/domain/format';
const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
if (typeof window !== 'undefined' && publicKey) initMercadoPago(publicKey, { locale: 'pt-BR' });
export default function MercadoPagoCard({
  amountCents,
  email,
  onSubmit,
  subscription = false,
}: {
  amountCents: number;
  email: string;
  onSubmit: (token: PaymentToken) => Promise<void>;
  subscription?: boolean;
}) {
  const key = publicKey,
    [error, setError] = useState('');

  if (!key)
    return (
      <p className="notice" role="status">
        O pagamento por cartão estará disponível quando a loja concluir a conexão com o Mercado
        Pago.
      </p>
    );
  return (
    <section className="admin-panel">
      <h2>{subscription ? 'Autorizar assinatura mensal' : 'Pagar com cartão'}</h2>
      <p>
        {money(amountCents)}
        {subscription ? ' por mês, com renovação automática.' : ''}
      </p>
      {
        <CardPayment
          id="meo-card-payment"
          initialization={{ amount: amountCents / 100, payer: { email } }}
          customization={{ paymentMethods: { maxInstallments: subscription ? 1 : 3 } }}
          onSubmit={async (data) => {
            setError('');
            try {
              await onSubmit({
                token: data.token,
                paymentMethodId: data.payment_method_id,
                issuerId: data.issuer_id?.toString(),
                installments: data.installments,
                payer: {
                  email: data.payer.email || email,
                  identification: data.payer.identification,
                },
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Não foi possível concluir o pagamento.');
              throw e;
            }
          }}
          onError={() =>
            setError('O formulário do Mercado Pago não carregou. Recarregue ou escolha Pix.')
          }
        />
      }
      <p className="demo-text">
        Os dados do cartão são tratados pelo Mercado Pago. A loja recebe um token para processar o
        pagamento.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}

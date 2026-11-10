'use client';
import { useState } from 'react';
import { StatusScreen, initMercadoPago } from '@mercadopago/sdk-react';
import type { PaymentAction } from '@/lib/domain/types';
const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
if (typeof window !== 'undefined' && publicKey) initMercadoPago(publicKey, { locale: 'pt-BR' });
export default function MercadoPagoChallenge({
  action,
}: {
  action: Extract<PaymentAction, { type: 'challenge' }>;
}) {
  const [error, setError] = useState('');
  return (
    <section className="stack payment-panel" aria-label="Confirmação do cartão">
      <h2>Confirme a compra com seu banco.</h2>
      <p>Conclua a verificação abaixo para continuar o pagamento.</p>
      {publicKey ? (
        <StatusScreen
          id="meo-card-challenge"
          initialization={{
            paymentId: action.paymentId,
            additionalInfo: { externalResourceURL: action.externalResourceUrl, creq: action.creq },
          }}
          onError={() =>
            setError(
              'A confirmação do banco não carregou ou expirou. Atualize a situação do pagamento antes de tentar novamente.',
            )
          }
        />
      ) : (
        <p className="notice">
          A loja precisa concluir a conexão com o Mercado Pago para exibir esta confirmação.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

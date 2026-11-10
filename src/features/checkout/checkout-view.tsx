'use client';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PaymentToken } from '@/lib/domain/types';
const MercadoPagoCard = dynamic(() => import('./mercado-pago-card'), { ssr: false });
import { useRouter } from 'next/navigation';
import type { Address, CheckoutInput, PaymentMethod, ShippingQuote } from '@/lib/domain/types';
import { addressSchema } from '@/lib/domain/schemas';
import { calculateTotals, validateSplit } from '@/lib/domain/commerce';
import { centsFromInput, money } from '@/lib/domain/format';
import { useCartStore } from '@/lib/store/cart';
import { useCommand, useGateway } from '@/lib/api/query';
import { errorMessage, type CommerceGateway } from '@/lib/api/contracts';
import { IS_DEMO } from '@/lib/api/config';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Form } from '@/components/ui/form';
import { AddressFields, emptyAddress } from '@/components/ui/address-fields';
import { PrayingWait } from '@/components/ui/praying-wait';
import { EmptyState, Notice } from '@/components/ui/states';
import { Steps } from '@/components/ui/steps';
import { PriceSummary } from './price-summary';
export function CheckoutView() {
  const items = useCartStore((s) => s.items),
    clear = useCartStore((s) => s.clear),
    [step, setStep] = useState(0),
    [address, setAddress] = useState<Address>(emptyAddress),
    [shipping, setShipping] = useState<string>('standard'),
    [rates, setRates] = useState<ShippingQuote[]>([]),
    [payment, setPayment] = useState<PaymentMethod>('pix'),
    [pixValue, setPixValue] = useState('50'),
    [installments, setInstallments] = useState(1),
    [coupon, setCoupon] = useState(''),
    [couponError, setCouponError] = useState(''),
    [estimate, setEstimate] = useState<Awaited<ReturnType<CommerceGateway['estimate']>>>(),
    [submitted, setSubmitted] = useState(false),
    [cardRequested, setCardRequested] = useState(false),
    key = useRef<string>(''),
    gateway = useGateway(),
    router = useRouter(),
    create = useCommand((g, input: CheckoutInput) => g.checkout(input)),
    shippingCents = rates.find((r) => r.id === shipping)?.cents ?? (IS_DEMO ? 1890 : 0),
    totals =
      !IS_DEMO && estimate
        ? estimate
        : calculateTotals(items, shippingCents, IS_DEMO ? coupon : '');
  async function refreshEstimate(code = coupon) {
    const result = await gateway.estimate({
      items: items.map(({ productId, quantity, color, sizeIndex, dedication }) => ({
        productId,
        quantity,
        color,
        sizeIndex,
        dedication,
      })),
      coupon: code,
      ...(address.cep ? { cep: address.cep } : {}),
      shippingQuoteId: rates.find((r) => r.id === shipping)?.quoteId,
    });
    setEstimate(result);
    return result;
  }
  async function complete(paymentToken?: PaymentToken) {
    if (payment === 'split') validateSplit(totals.totalCents, centsFromInput(pixValue));
    if (!key.current) key.current = crypto.randomUUID();
    const result = await create.mutateAsync({
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        color: i.color,
        sizeIndex: i.sizeIndex,
        dedication: i.dedication,
      })),
      address,
      shipping,
      coupon,
      payment,
      pixCents:
        payment === 'split' ? centsFromInput(pixValue) : payment === 'pix' ? totals.totalCents : 0,
      installments: paymentToken?.installments || installments,
      consent: true,
      paymentToken,
      shippingQuoteId: rates.find((r) => r.id === shipping)?.quoteId,
      shippingServiceId: rates.find((r) => r.id === shipping)?.serviceId,
      idempotencyKey: key.current,
    });
    setSubmitted(true);
    clear();
    router.push('/checkout/sucesso?pedido=' + encodeURIComponent(result.orderId));
  }
  if (cardRequested)
    return (
      <main id="main" className="container page-top">
        <MercadoPagoCard
          amountCents={
            payment === 'split' ? totals.totalCents - centsFromInput(pixValue) : totals.totalCents
          }
          email={address.email}
          onSubmit={complete}
        />
        <Button variant="text" onClick={() => setCardRequested(false)}>
          Voltar ao pedido
        </Button>
      </main>
    );
  if (submitted)
    return (
      <main id="main" className="container">
        <PrayingWait
          title="Preparando a confirmação do seu pedido…"
          description="Em instantes você verá o pagamento e o acompanhamento do pedido."
        />
      </main>
    );
  if (!items.length)
    return (
      <main id="main" className="container">
        <EmptyState
          title="Uma escolha dá início à história."
          description="Seu carrinho está vazio. Explore as peças para continuar."
          action={<ButtonLink href="/produtos">Encontrar minha peça</ButtonLink>}
        />
      </main>
    );
  return (
    <main id="main" className="container">
      <div className="checkout-layout">
        <section>
          <h1>
            Um passo mais perto
            <br />
            do seu significado.
          </h1>
          <Steps items={['Seus dados', 'Entrega', 'Pagamento']} current={step} />
          {IS_DEMO && (
            <Notice>
              Checkout de demonstração. Use dados fictícios; nenhum pagamento ou envio real será
              realizado.
            </Notice>
          )}
          {step === 0 ? (
            <Form
              className="stack"
              onSubmit={async () => {
                addressSchema.parse(address);
                const quoted = await gateway.shipping(
                  address.cep,
                  items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    sizeIndex: i.sizeIndex,
                  })),
                );
                if (!quoted.length) throw new Error('Nenhum frete disponível para este CEP.');
                setRates(quoted);
                setShipping(quoted[0].id);
                setStep(1);
                window.scrollTo(0, 0);
              }}
            >
              <AddressFields value={address} onChange={setAddress} />
              <div className="form-actions">
                <span />
                <Button>
                  Continuar para entrega <Icon name="arrow" />
                </Button>
              </div>
            </Form>
          ) : step === 1 ? (
            <Form
              className="stack"
              onSubmit={async () => {
                if (!IS_DEMO) await refreshEstimate();
                setStep(2);
                window.scrollTo(0, 0);
              }}
            >
              <h2>Como sua peça chega até você?</h2>
              {rates.map((rate) => (
                <label
                  className={`radio-card ${shipping === rate.id ? 'active' : ''}`}
                  key={rate.id}
                >
                  <input
                    type="radio"
                    name="shipping"
                    checked={shipping === rate.id}
                    onChange={() => setShipping(rate.id)}
                  />
                  <span className="grow">
                    <strong>{rate.label}</strong>
                    <small>{rate.estimate}</small>
                  </span>
                  <strong>{money(rate.cents)}</strong>
                </label>
              ))}
              <div className="notice">
                <strong>{address.name}</strong>
                <br />
                {address.street}, {address.number} · {address.city}/{address.state} · {address.cep}
              </div>
              <div className="form-actions">
                <Button type="button" variant="text" onClick={() => setStep(0)}>
                  Voltar
                </Button>
                <Button>
                  Continuar para pagamento <Icon name="arrow" />
                </Button>
              </div>
            </Form>
          ) : (
            <Form
              className="stack"
              onSubmit={async (d) => {
                if (!d.has('consent')) throw new Error('Confirme os dados para continuar.');
                if (!IS_DEMO) await refreshEstimate();
                if (!IS_DEMO && payment !== 'pix') {
                  setCardRequested(true);
                  return;
                }
                await complete();
              }}
            >
              {(pending) => (
                <>
                  <h2>Escolha como pagar</h2>
                  <div className="payment-tabs" role="group" aria-label="Forma de pagamento">
                    {(
                      [
                        ['pix', 'Pix', 'pix'],
                        ['card', 'Cartão', 'card'],
                        ['split', 'Pix + cartão', 'split'],
                      ] as const
                    ).map(([id, label, icon]) => (
                      <button
                        type="button"
                        className={payment === id ? 'active' : ''}
                        aria-pressed={payment === id}
                        key={id}
                        onClick={() => setPayment(id)}
                      >
                        <Icon name={icon} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="demo-card">
                    <Icon name={payment === 'card' ? 'card' : 'pix'} />
                    <div>
                      <strong>
                        {payment === 'card'
                          ? IS_DEMO
                            ? 'Cartão de teste ···· 4242'
                            : 'Pagamento pelo provedor'
                          : payment === 'split'
                            ? 'Combine Pix e cartão'
                            : 'Pagamento com Pix'}
                      </strong>
                      <small>
                        {IS_DEMO
                          ? 'Nenhum dado real de cartão é solicitado.'
                          : 'Os dados de pagamento são tratados no ambiente do provedor.'}
                      </small>
                    </div>
                  </div>
                  {payment === 'split' && (
                    <div className="split-numbers">
                      <label className="split-box">
                        <small>Parte em Pix</small>
                        <input
                          type="number"
                          min=".01"
                          max={(totals.totalCents - 1) / 100}
                          step=".01"
                          required
                          value={pixValue}
                          onChange={(e) => setPixValue(e.target.value)}
                        />
                      </label>
                      <div className="split-box">
                        <small>Saldo no cartão</small>
                        <strong>
                          {money(Math.max(0, totals.totalCents - centsFromInput(pixValue)))}
                        </strong>
                      </div>
                    </div>
                  )}
                  {payment !== 'pix' && (
                    <label>
                      Parcelamento do cartão
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                      >
                        {[1, 2, 3].map((n) => (
                          <option value={n} key={n}>
                            {n}× de{' '}
                            {money(
                              Math.round(
                                (payment === 'split'
                                  ? Math.max(0, totals.totalCents - centsFromInput(pixValue))
                                  : totals.totalCents) / n,
                              ),
                            )}{' '}
                            sem juros
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="check-line">
                    <input type="checkbox" name="consent" required />
                    {IS_DEMO
                      ? 'Entendi que esta compra é uma simulação e não cria cobrança real.'
                      : 'Revisei meus dados, os itens e o valor deste pedido.'}
                  </label>
                  {create.isPending && !IS_DEMO && (
                    <PrayingWait
                      compact
                      title="Registrando seu pedido…"
                      description="Estamos gerando o pagamento com o Mercado Pago."
                    />
                  )}
                  <div className="form-actions">
                    <Button type="button" variant="text" onClick={() => setStep(1)}>
                      Voltar
                    </Button>
                    <Button loading={pending || create.isPending}>
                      {IS_DEMO ? 'Concluir demonstração' : 'Concluir pedido'} <Icon name="arrow" />
                    </Button>
                  </div>
                </>
              )}
            </Form>
          )}
        </section>
        <PriceSummary
          items={!IS_DEMO && estimate ? estimate.items : items}
          shippingCents={shippingCents}
          coupon={IS_DEMO ? coupon : ''}
          quotedTotals={totals}
          shippingPending={!rates.length}
        >
          <form
            className="row"
            style={{ marginTop: 22 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get('coupon') || '')
                .trim()
                .toUpperCase();
              if (!IS_DEMO) {
                try {
                  await refreshEstimate(code);
                  setCoupon(code);
                  setCouponError('');
                } catch (error) {
                  setCoupon('');
                  setCouponError(errorMessage(error));
                  setEstimate(undefined);
                }
              } else if (code === 'PRIMEIRAFE') {
                setCoupon(code);
                setCouponError('');
              } else {
                setCoupon('');
                setCouponError('Cupom não encontrado.');
              }
            }}
          >
            <input name="coupon" placeholder="Cupom de desconto" aria-label="Cupom de desconto" />
            <Button variant="secondary" className="small">
              Aplicar
            </Button>
          </form>
          {coupon && (
            <small className="coupon-success">PRIMEIRAFE · 10% de desconto aplicado</small>
          )}
          {couponError && (
            <small className="form-error" role="alert">
              {couponError}
            </small>
          )}
        </PriceSummary>
      </div>
    </main>
  );
}

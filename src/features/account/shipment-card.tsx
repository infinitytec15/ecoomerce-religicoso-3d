'use client';
import { useState } from 'react';
import type { Charge, Order } from '@/lib/domain/types';
import { dateLabel, money } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { trackingUrl } from '@maos-em-oracao/contracts';
export function ShipmentCard({ order, details = true }: { order: Order; details?: boolean }) {
  const [open, setOpen] = useState(false),
    index =
      order.status === 'Entregue'
        ? 3
        : order.status === 'Enviado'
          ? 2
          : ['Em produção', 'Em acabamento', 'Pronto para envio'].includes(order.status)
            ? 1
            : order.status === 'Confirmado'
              ? 0
              : -1;
  return (
    <>
      <article className="shipment-card">
        <div className="row between wrap">
          <div>
            <h3>{order.edition || order.number}</h3>
            <p>
              {order.number} · expedição prevista {dateLabel(order.due)}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="order-preview">
          {order.items.map((item) => (
            <ProductImage key={item.key} src={item.image} alt={item.name} sizes="65px" />
          ))}
        </div>
        {order.status !== 'Cancelado' && (
          <ol className="shipment-progress">
            {['Pagamento confirmado', 'Em produção', 'Enviado', 'Entregue'].map((step, i) => (
              <li key={step} className={i <= index ? 'done' : ''}>
                <span>{i <= index && <Icon name="check" />}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
        <div className="row between wrap">
          {order.tracking ? (
            <span className="shipment-tracking">
              <small className="muted">
                {order.carrier ? order.carrier + ' · ' : ''}
                {'Rastreio' + (IS_DEMO ? ' de demonstração' : '') + ': '}
                <strong>{order.tracking}</strong>
              </small>
              {!IS_DEMO && (
                <a
                  className="btn secondary small"
                  href={trackingUrl(order.tracking)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Rastrear envio <Icon name="arrow" />
                </a>
              )}
            </span>
          ) : (
            <small className="muted">Código de rastreio disponível após a expedição.</small>
          )}
          {details && (
            <Button variant="text" onClick={() => setOpen(true)}>
              Detalhes do envio <Icon name="arrow" />
            </Button>
          )}
        </div>
      </article>
      <Modal open={open} onOpenChange={setOpen} title="Detalhes do envio">
        <ShipmentCard order={order} details={false} />
        <div className="subscriber-address">
          <h3>Destino</h3>
          <p>
            {order.address.street}, {order.address.number} · {order.address.city}/
            {order.address.state} · {order.address.cep}
          </p>
          <small>
            {order.carrier}
            {IS_DEMO ? ' · acompanhamento demonstrativo, sem remessa real.' : ''}
          </small>
        </div>
      </Modal>
    </>
  );
}
export function ReceiptButton({ charge }: { charge: Charge }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="text" onClick={() => setOpen(true)}>
        Ver comprovante
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={IS_DEMO ? 'Comprovante demonstrativo' : 'Resumo do pagamento'}
      >
        <div className="receipt-demo">
          <h3>{charge.description}</h3>
          <p>{charge.id}</p>
          <div className="money-line">
            <span>Valor</span>
            <strong>{money(charge.amountCents)}</strong>
          </div>
          <div className="money-line">
            <span>Situação</span>
            <StatusBadge status={charge.status} />
          </div>
          <p>
            {dateLabel(charge.paidAt || charge.due)} ·{' '}
            {charge.method === 'split'
              ? 'Pix + cartão'
              : charge.method === 'card'
                ? 'Cartão'
                : 'Pix'}
          </p>
          {IS_DEMO && <small>Documento ilustrativo, sem validade fiscal ou financeira.</small>}
        </div>
      </Modal>
    </>
  );
}

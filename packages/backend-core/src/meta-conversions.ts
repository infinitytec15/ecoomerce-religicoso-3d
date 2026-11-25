import type { Attribution } from '@maos-em-oracao/contracts';
import { metaEnabled, sendMetaPurchase } from '@maos-em-oracao/integrations';
import type { Transaction } from '@maos-em-oracao/database';
import type { Context } from './context';
import type { Notifications } from './notifications';
import { data } from './shared';

interface OrderAddress {
  name?: string;
  email?: string;
  phone?: string;
  cep?: string;
  city?: string;
  state?: string;
}

/** Reports paid store orders to the Meta Conversions API (server-side Purchase). */
export class MetaConversionsService {
  constructor(private ctx: Context) {}

  enabled() {
    return metaEnabled(this.ctx.config);
  }

  /**
   * Queues the Purchase inside the payment transaction, so it is sent once and retried by the
   * worker. Skips orders whose buyer did not accept marketing cookies.
   */
  async enqueue(tx: Transaction, order: { id: string; data: unknown }, outbox: Notifications) {
    if (!this.enabled()) return;
    const attribution = data<{ attribution?: Attribution }>(order.data).attribution;
    if (!attribution?.marketingConsent) return;
    await outbox.event(tx, 'meta-purchase/' + order.id, 'meta-purchase', order.id, {
      orderId: order.id,
    });
  }

  async purchase(orderId: string) {
    const order = await this.ctx.db.order.findUnique({
      where: { id: orderId },
      include: { items: true, customer: true },
    });
    if (!order) return;
    const address = data<OrderAddress>(order.address),
      attribution = data<{ attribution?: Attribution }>(order.data).attribution ?? {},
      [firstName, ...rest] = (address.name || order.customer.name || '').trim().split(/\s+/);
    await sendMetaPurchase(this.ctx.config, {
      eventId: order.id,
      eventTime: new Date(),
      sourceUrl: this.ctx.config.PUBLIC_WEB_URL + '/checkout',
      valueCents: order.totalCents,
      contentIds: [...new Set(order.items.map((i) => i.productId))],
      numItems: order.items.reduce((n, i) => n + i.quantity, 0),
      customer: {
        email: address.email || order.customer.email,
        phone: address.phone,
        firstName,
        lastName: rest.join(' '),
        city: address.city,
        state: address.state,
        zip: address.cep,
        country: 'br',
        externalId: order.customerId,
        fbp: attribution.fbp,
        fbc: attribution.fbc,
        userAgent: attribution.userAgent,
      },
    });
  }
}

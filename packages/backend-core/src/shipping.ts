import { z } from 'zod';
import { transaction, lock } from '@maos-em-oracao/database';
import type { Address, WorkspaceSettings } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings } from './context';
import { Notifications } from './notifications';
import { OrdersService } from './orders';
import { data, json, permit, requireValue, DomainError, audit, type Actor } from './shared';
import { ShippingCredentials } from './credentials';
import { orderInclude } from './projections';
export class ShippingService {
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  private async credential() {
    return new ShippingCredentials(this.ctx).access();
  }
  async request(actor: Actor | null, id: string, action: 'prepare' | 'generate' | 'cancel') {
    const a = permit(actor, 'shipping');
    let freshQuote: Awaited<ReturnType<Context['db']['shippingQuote']['findUnique']>> = null;
    if (action === 'prepare') {
      const order = requireValue(
        await this.ctx.db.order.findUnique({ where: { id }, include: orderInclude }),
      );
      if (
        order.payment?.status !== 'Pago' ||
        ['Cancelado', 'Enviado', 'Entregue'].includes(order.status)
      )
        throw new DomainError('ORDER_NOT_READY', 'O pedido não permite preparar o envio.', 409);
      const current = await this.ctx.db.shipment.findUnique({ where: { orderId: id } });
      if (current && !['prepared', 'cancelled'].includes(current.state)) return;
      const options = await new OrdersService(this.ctx).quote({
        cep: data<Address>(order.address).cep,
        items: order.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          sizeIndex: data<{ sizeIndex: number }>(i.data).sizeIndex,
        })),
      });
      const service = data<{ shippingServiceId?: string }>(order.data).shippingServiceId;
      const selected = requireValue(
        options.find((q) => q.serviceId === service) ||
          options.sort((a, b) => a.cents - b.cents)[0],
        'Não há cotação disponível para esta remessa.',
      );
      freshQuote = requireValue(
        await this.ctx.db.shippingQuote.findUnique({ where: { id: selected.id } }),
      );
    }
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'shipment/' + id);
      const o = requireValue(await tx.order.findUnique({ where: { id }, include: orderInclude }));
      if (o.payment?.status !== 'Pago')
        throw new DomainError(
          'PAYMENT_REQUIRED',
          'A expedição exige pagamento integral confirmado.',
          409,
        );
      if (['Enviado', 'Entregue', 'Cancelado'].includes(o.status))
        throw new DomainError('ORDER_CLOSED', 'Este pedido não permite alterar a etiqueta.', 409);
      const d = data<{ shippingQuoteId?: string; shippingServiceId?: string }>(o.data);
      const shipment = await tx.shipment.upsert({
        where: { orderId: id },
        create: {
          orderId: id,
          serviceId: d.shippingServiceId || '',
          carrier: '',
          data: { quoteId: d.shippingQuoteId },
        },
        update: {},
      });
      if (action === 'prepare') {
        if (freshQuote && ['prepared', 'cancelled'].includes(shipment.state))
          await tx.shipment.update({
            where: { id: shipment.id },
            data: {
              state: 'prepared',
              providerId: null,
              serviceId: freshQuote.serviceId,
              carrier: freshQuote.carrier,
              labelUrl: null,
              data: json({ ...data<object>(shipment.data), quoteId: freshQuote.id }),
            },
          });
        await audit(tx, a.id, 'Expedição conferida', id);
        return;
      }
      if (action === 'cancel') {
        if (shipment.state === 'cancelled') return;
        await this.mail.event(
          tx,
          'shipping-cancel/' + shipment.id,
          'shipping-cancel',
          shipment.id,
          { shipmentId: shipment.id },
        );
      } else {
        if (o.status !== 'Pronto para envio')
          throw new DomainError(
            'PRODUCTION_REQUIRED',
            'Finalize a conferência da produção antes de gerar a etiqueta.',
            409,
          );
        if (shipment.state === 'ready') return;
        if (shipment.state.includes('unknown'))
          throw new DomainError(
            'SHIPPING_RECONCILIATION',
            'Confira a operação no Melhor Envio antes de repetir.',
            409,
          );
        const quoteId = data<{ quoteId?: string }>(shipment.data).quoteId,
          quoted = quoteId ? await tx.shippingQuote.findUnique({ where: { id: quoteId } }) : null;
        if (!quoted || quoted.expiresAt < new Date())
          throw new DomainError(
            'QUOTE_EXPIRED',
            'Confira e prepare o envio novamente para atualizar o preço do frete.',
            409,
          );
        if (
          this.ctx.config.INTEGRATIONS_MODE === 'live' &&
          !data<{ fiscal?: unknown }>(shipment.data).fiscal
        )
          throw new DomainError(
            'FISCAL_DATA_REQUIRED',
            'Salve a documentação fiscal antes de comprar a etiqueta.',
            409,
          );
        await this.mail.event(
          tx,
          'shipping-generate/' + shipment.id + '/' + quoted.id,
          'shipping-label',
          shipment.id,
          { shipmentId: shipment.id },
        );
      }
      await audit(tx, a.id, 'Etiqueta: ' + action, id);
    });
  }
  async details(actor: Actor | null, id: string) {
    permit(actor, 'shipping');
    const shipment = await this.ctx.db.shipment.findUnique({ where: { orderId: id } });
    if (!shipment) return { state: 'not-prepared', quote: null, fiscal: null, labelUrl: null };
    const d = data<{ quoteId?: string; fiscal?: unknown }>(shipment.data),
      quote = d.quoteId
        ? await this.ctx.db.shippingQuote.findUnique({ where: { id: d.quoteId } })
        : null;
    return {
      state: shipment.state,
      quote: quote
        ? {
            carrier: quote.carrier,
            cents: data<{ cents: number }>(quote.data).cents,
            expiresAt: quote.expiresAt.toISOString(),
          }
        : null,
      fiscal: d.fiscal || null,
      labelUrl: shipment.labelUrl,
    };
  }
  async fiscal(actor: Actor | null, id: string, value: unknown) {
    const a = permit(actor, 'shipping');
    const fiscal = z
      .union([
        z.object({ invoiceKey: z.string().regex(/^\d{44}$/) }),
        z.object({ nonCommercial: z.literal(true) }),
      ])
      .parse(value);
    const s = requireValue(await this.ctx.db.shipment.findUnique({ where: { orderId: id } }));
    if (s.state !== 'prepared')
      throw new DomainError(
        'LABEL_ALREADY_CREATED',
        'A documentação não pode mudar depois da criação do envio.',
        409,
      );
    await this.ctx.db.shipment.update({
      where: { id: s.id },
      data: { data: json({ ...data<object>(s.data), fiscal }) },
    });
    await audit(this.ctx.db, a.id, 'Documentação fiscal da remessa atualizada', id);
  }
  async generate(id: string) {
    let s = requireValue(
      await this.ctx.db.shipment.findUnique({
        where: { id },
        include: { order: { include: orderInclude } },
      }),
    );
    const token = await this.credential(),
      config = await settings(this.ctx.db);
    if (s.order.payment?.status !== 'Pago' || s.order.status !== 'Pronto para envio')
      throw new DomainError(
        'SHIPMENT_NOT_READY',
        'A remessa não está pronta para geração de etiqueta.',
        409,
      );
    if (s.state === 'ready') return;
    if (s.state.includes('unknown') || ['creating', 'purchasing'].includes(s.state))
      throw new DomainError(
        'SHIPPING_RECONCILIATION',
        'A operação anterior precisa ser conciliada.',
        409,
      );
    let d = data<{ quoteId?: string; fiscal?: { invoiceKey?: string; nonCommercial?: boolean } }>(
        s.data,
      ),
      quote = d.quoteId
        ? await this.ctx.db.shippingQuote.findUnique({ where: { id: d.quoteId } })
        : null;
    if (!quote) {
      const quotes = await new OrdersService(this.ctx).quote({
        cep: data<Address>(s.order.address).cep,
        items: s.order.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          sizeIndex: data<{ sizeIndex: number }>(i.data).sizeIndex,
        })),
      });
      const selected = quotes.sort((a, b) => a.cents - b.cents)[0];
      quote = selected
        ? await this.ctx.db.shippingQuote.findUnique({ where: { id: selected.id } })
        : null;
      if (!quote) throw new DomainError('QUOTE_REQUIRED', 'Não há serviço de frete disponível.');
      await this.ctx.db.shipment.update({
        where: { id },
        data: { serviceId: quote.serviceId, data: json({ ...d, quoteId: quote.id }) },
      });
      d = { ...d, quoteId: quote.id };
    }
    if (s.state === 'prepared' && quote.expiresAt < new Date())
      throw new DomainError(
        'QUOTE_EXPIRED',
        'Prepare o envio novamente para atualizar o frete.',
        409,
      );
    if (this.ctx.config.INTEGRATIONS_MODE === 'live' && !d.fiscal)
      throw new DomainError(
        'FISCAL_DATA_REQUIRED',
        'Informe a nota fiscal ou a declaração aplicável antes de gerar o envio.',
        409,
      );
    if (s.state === 'prepared') {
      const claimed = await this.ctx.db.shipment.updateMany({
        where: { id, state: 'prepared' },
        data: { state: 'creating' },
      });
      if (!claimed.count) return;
      try {
        const address = data<Address>(s.order.address),
          q = data<{
            data: {
              packages?: {
                dimensions: { width: number; height: number; length: number };
                weight: number;
              }[];
            };
            cents: number;
          }>(quote.data),
          origin = config.workspace;
        const payload = {
          service: Number(quote.serviceId),
          from: { ...this.origin(origin), phone: config.store.phone.replace(/\D/g, '') },
          to: {
            name: address.name,
            email: address.email,
            phone: address.phone,
            document: (address.document || '').replace(/\D/g, ''),
            address: address.street,
            number: address.number,
            complement: address.extra,
            district: address.district,
            city: address.city,
            state_abbr: address.state,
            postal_code: address.cep.replace(/\D/g, ''),
          },
          products: s.order.items.map((i) => {
            const v = data<{ name: string }>(i.data);
            return { name: v.name, quantity: i.quantity, unitary_value: i.unitCents / 100 };
          }),
          volumes: (q.data.packages || []).map((p) => ({
            width: Number(p.dimensions.width),
            height: Number(p.dimensions.height),
            length: Number(p.dimensions.length),
            weight: Number(p.weight),
          })),
          options: {
            insurance_value: Math.max(0, s.order.subtotalCents - s.order.discountCents) / 100,
            receipt: false,
            own_hand: false,
            ...(d.fiscal?.invoiceKey
              ? { invoice: { key: d.fiscal.invoiceKey } }
              : { non_commercial: true }),
            platform: 'MaosEmOracao',
            tags: [
              {
                tag: s.order.id,
                url: this.ctx.config.PUBLIC_WEB_URL + '/conta/pedidos/' + s.order.id,
              },
            ],
          },
        };
        const created = await this.ctx.shipping.cart(payload, s.id, token);
        await this.ctx.db.shipment.update({
          where: { id },
          data: {
            providerId: created.id,
            state: 'created',
            serviceId: quote.serviceId,
            carrier: quote.carrier,
          },
        });
      } catch (error) {
        await this.ctx.db.shipment.update({ where: { id }, data: { state: 'create_unknown' } });
        throw error;
      }
    }
    s = requireValue(
      await this.ctx.db.shipment.findUnique({
        where: { id },
        include: { order: { include: orderInclude } },
      }),
    );
    if (s.state === 'created') {
      const claimed = await this.ctx.db.shipment.updateMany({
        where: { id, state: 'created' },
        data: { state: 'purchasing' },
      });
      if (!claimed.count) return;
      try {
        await this.ctx.shipping.checkout(requireValue(s.providerId), token);
        await transaction(this.ctx.db, async (tx) => {
          await tx.shipment.update({ where: { id }, data: { state: 'purchased' } });
          const q = data<{ cents: number }>(quote.data);
          if (q.cents > 0)
            await tx.ledgerEntry.upsert({
              where: { eventKey: 'shipping/' + id + '/' + s.providerId },
              create: {
                eventKey: 'shipping/' + id + '/' + s.providerId,
                kind: 'shipping',
                amountCents: -q.cents,
              },
              update: {},
            });
        });
      } catch (error) {
        await this.ctx.db.shipment.update({ where: { id }, data: { state: 'purchase_unknown' } });
        throw error;
      }
    }
    s = requireValue(
      await this.ctx.db.shipment.findUnique({
        where: { id },
        include: { order: { include: orderInclude } },
      }),
    );
    if (s.state === 'purchased' || s.state === 'generating') {
      await this.ctx.shipping.generate(requireValue(s.providerId), token);
      await this.ctx.db.shipment.update({ where: { id }, data: { state: 'generating' } });
      const label = await this.ctx.shipping.label(requireValue(s.providerId), token);
      await this.ctx.db.shipment.update({
        where: { id },
        data: { state: 'ready', labelUrl: label.url },
      });
    }
  }
  private origin(s: WorkspaceSettings) {
    if (
      this.ctx.config.INTEGRATIONS_MODE === 'live' &&
      (!s.document || s.originStreet === 'Rua Exemplo')
    )
      throw new DomainError(
        'ORIGIN_REQUIRED',
        'Configure os dados reais do remetente antes de comprar frete.',
        409,
      );
    return {
      name: s.legalName,
      phone: '',
      email: this.ctx.config.EMAIL_REPLY_TO,
      document: s.document.replace(/\D/g, ''),
      address: s.originStreet,
      number: s.originNumber,
      district: s.originDistrict,
      city: s.originCity,
      state_abbr: s.originState,
      postal_code: s.originCep.replace(/\D/g, ''),
    };
  }
  async cancel(id: string) {
    const s = requireValue(
      await this.ctx.db.shipment.findUnique({ where: { id }, include: { order: true } }),
    );
    if (
      ['posted', 'delivered'].includes(s.state) ||
      ['Enviado', 'Entregue'].includes(s.order.status)
    )
      throw new DomainError('SHIPMENT_POSTED', 'O envio já foi postado.', 409);
    if (s.providerId)
      await this.ctx.shipping.cancel(
        s.providerId,
        'Cancelamento solicitado pela loja.',
        await this.credential(),
      );
    await this.ctx.db.shipment.update({ where: { id }, data: { state: 'cancelled' } });
  }
  async dispatch(actor: Actor | null, id: string, tracking: string, carrier: string) {
    const a = permit(actor, 'shipping');
    z.string().trim().min(5).max(100).parse(tracking);
    z.string().trim().min(2).max(100).parse(carrier);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'order/' + id);
      const o = requireValue(await tx.order.findUnique({ where: { id }, include: orderInclude }));
      if (o.status === 'Enviado') return;
      if (o.payment?.status !== 'Pago' || o.status !== 'Pronto para envio')
        throw new DomainError(
          'ORDER_NOT_READY',
          'Confira o pagamento e a produção antes de postar.',
          409,
        );
      if (!o.shipment || o.shipment.state !== 'ready')
        throw new DomainError(
          'LABEL_REQUIRED',
          'Gere uma etiqueta válida antes de confirmar a postagem.',
          409,
        );
      await tx.shipment.update({
        where: { id: o.shipment.id },
        data: { state: 'posted', tracking, carrier },
      });
      await tx.order.update({ where: { id }, data: { status: 'Enviado' } });
      const addr = data<Address>(o.address);
      await this.mail.email(tx, 'shipment-posted/' + o.shipment.id, id, addr.email, {
        kind: 'shipment-posted',
        name: addr.name,
        orderNumber: 'MEO-' + String(o.number).padStart(6, '0'),
        carrier,
        trackingCode: tracking,
        trackingUrl: await this.mail.orderUrl(tx, id),
        actionUrl: await this.mail.orderUrl(tx, id),
      });
      await audit(tx, a.id, 'Postagem confirmada', id);
    });
  }
  async reconcile(id: string) {
    const s = requireValue(
      await this.ctx.db.shipment.findUnique({ where: { id }, include: { order: true } }),
    );
    if (!s.providerId) return;
    const r = await this.ctx.shipping.tracking(s.providerId, await this.credential());
    if (['posted', 'in_transit', 'delivered'].includes(r.state))
      await this.ctx.db.shipment.update({
        where: { id },
        data: {
          tracking: r.tracking || s.tracking,
          carrier: r.carrier || s.carrier,
          state: r.state === 'delivered' ? 'delivered' : 'posted',
        },
      });
    if (r.state === 'delivered')
      await this.ctx.db.order.updateMany({
        where: { id: s.orderId, status: { in: ['Enviado', 'Pronto para envio'] } },
        data: { status: 'Entregue' },
      });
    else if (['posted', 'in_transit'].includes(r.state))
      await this.ctx.db.order.updateMany({
        where: { id: s.orderId, status: 'Pronto para envio' },
        data: { status: 'Enviado' },
      });
  }
}

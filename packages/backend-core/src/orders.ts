import { z } from 'zod';
import type { QuoteProduct } from '@maos-em-oracao/integrations';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import {
  checkoutSchema,
  type CartItem,
  type Address,
  type OrderItemInput,
  type Coupon,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { settings } from './context';
import { digest } from './security';
import { ShippingCredentials } from './credentials';
import { AuthService } from './auth';
import { Notifications } from './notifications';
import { PaymentsService } from './payments';
import { data, json, requireValue, DomainError, type Actor, addDays, audit } from './shared';
import {
  orderInclude,
  orderDto,
  chargeDto,
  customerDto,
  subscriptionDto,
  ticketDto,
} from './projections';
/** Current production cost per product, frozen into each order line at sale time. */
export async function productCosts(
  tx: Transaction | Context['db'],
  items: { productId: string }[],
) {
  const rows = await tx.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    select: { id: true, costCents: true },
  });
  return new Map(rows.map((r) => [r.id, r.costCents]));
}
export class OrdersService {
  readonly payments: PaymentsService;
  readonly auth: AuthService;
  readonly mail: Notifications;
  constructor(private ctx: Context) {
    this.payments = new PaymentsService(ctx);
    this.auth = new AuthService(ctx);
    this.mail = new Notifications(ctx);
  }
  async cart(tx: Transaction | Context['db'], items: OrderItemInput[]) {
    const result: CartItem[] = [];
    for (const item of items) {
      const product = requireValue(
        await tx.product.findFirst({
          where: { id: item.productId, active: true, archived: false },
        }),
        'Produto indisponível.',
      );
      const p = data<{ colors: string[]; sizes: string[]; image: string; imageIndex: number }>(
        product.data,
      );
      if (!p.colors.includes(item.color) || !p.sizes[item.sizeIndex])
        throw new DomainError('INVALID_VARIANT', 'Confira a cor e o tamanho do produto.');
      result.push({
        key: [product.id, item.color, item.sizeIndex, item.dedication].join('|'),
        productId: product.id,
        name: product.name,
        image: p.image,
        imageIndex: p.imageIndex,
        color: item.color,
        size: p.sizes[item.sizeIndex],
        sizeIndex: item.sizeIndex,
        unitCents: product.priceCents + item.sizeIndex * 2000,
        quantity: item.quantity,
        dedication: item.dedication,
      });
    }
    return result;
  }
  async fingerprint(
    items: { productId: string; quantity: number; sizeIndex?: number }[],
    cep: string,
    tx: Transaction | Context['db'] = this.ctx.db,
  ) {
    const totals = new Map<string, { productId: string; quantity: number; sizeIndex: number }>();
    for (const i of items) {
      const key = i.productId + '/' + (i.sizeIndex || 0),
        old = totals.get(key);
      totals.set(key, {
        productId: i.productId,
        quantity: (old?.quantity || 0) + i.quantity,
        sizeIndex: i.sizeIndex || 0,
      });
    }
    const groups = [...totals.values()].sort((a, b) =>
      (a.productId + '/' + a.sizeIndex).localeCompare(b.productId + '/' + b.sizeIndex),
    );
    const products = [];
    for (const i of groups) {
      const p = requireValue(await tx.product.findUnique({ where: { id: i.productId } }));
      products.push({ ...i, price: p.priceCents, version: p.version });
    }
    const s = await settings(tx);
    return digest(
      JSON.stringify({
        cep: cep.replace(/\D/g, ''),
        products,
        origin: s.workspace.originCep,
        policy: s.workspace,
      }),
    );
  }
  async quote(value: unknown) {
    const input = z
        .object({
          cep: z.string().regex(/^\d{5}-?\d{3}$/),
          items: z
            .array(
              z.object({
                productId: z.string().min(1),
                quantity: z.number().int().min(1).max(50),
                sizeIndex: z.number().int().min(0).max(10).optional(),
              }),
            )
            .min(1)
            .max(50),
        })
        .parse(value),
      s = await settings(this.ctx.db);
    if (
      this.ctx.config.INTEGRATIONS_MODE === 'live' &&
      (!s.workspace.originCep || s.workspace.originStreet === 'Rua Exemplo')
    )
      throw new DomainError(
        'ORIGIN_REQUIRED',
        'Configure o endereço real do remetente nas configurações da loja.',
        409,
      );
    const products: QuoteProduct[] = [];
    let subtotal = 0,
      lead = s.workspace.productionDays;
    for (const i of input.items) {
      const p = requireValue(
        await this.ctx.db.product.findFirst({
          where: { id: i.productId, active: true, archived: false },
        }),
      );
      const d = data<{
        sizes: string[];
        shipping?: {
          weightGrams: number;
          widthCm: number;
          heightCm: number;
          lengthCm: number;
          leadTimeDays: number;
        };
      }>(p.data);
      if (!d.sizes[i.sizeIndex || 0])
        throw new DomainError('INVALID_VARIANT', 'Tamanho indisponível.');
      const dims = d.shipping;
      const unit = p.priceCents + (i.sizeIndex || 0) * 2000;
      subtotal += unit * i.quantity;
      lead = Math.max(lead, dims?.leadTimeDays || 0);
      products.push({
        id: p.id + '-' + (i.sizeIndex || 0),
        quantity: i.quantity,
        insuranceCents: unit,
        weightGrams: dims?.weightGrams || s.workspace.defaultWeightGrams,
        widthCm: dims?.widthCm || s.workspace.defaultWidthCm,
        heightCm: dims?.heightCm || s.workspace.defaultHeightCm,
        lengthCm: dims?.lengthCm || s.workspace.defaultLengthCm,
      });
    }
    const accessToken = await new ShippingCredentials(this.ctx).access();
    const quotes = await this.ctx.shipping.quotes({
        originCep: s.workspace.originCep,
        cep: input.cep,
        products,
        accessToken,
      }),
      hash = await this.fingerprint(input.items, input.cep),
      expires = addDays(0);
    expires.setMinutes(expires.getMinutes() + 15);
    return Promise.all(
      quotes.map(async (q) => {
        const amount =
          s.workspace.freeShippingAboveCents > 0 && subtotal >= s.workspace.freeShippingAboveCents
            ? 0
            : q.cents;
        const row = await this.ctx.db.shippingQuote.create({
          data: {
            cartHash: hash,
            cep: input.cep.replace(/\D/g, ''),
            serviceId: q.serviceId,
            carrier: q.carrier,
            amountCents: amount,
            expiresAt: expires,
            data: json({ ...q, products, leadTimeDays: lead }),
          },
        });
        return {
          id: row.id,
          quoteId: row.id,
          serviceId: q.serviceId,
          label: q.label,
          carrier: q.carrier,
          cents: amount,
          estimate: `${q.days} dias úteis de transporte + ${lead} dias de produção`,
          expiresAt: expires.toISOString(),
        };
      }),
    );
  }
  private async coupon(
    tx: Transaction | Context['db'],
    code: string,
    subtotal: number,
    consume = false,
  ) {
    if (!code.trim()) return { discount: 0, couponId: undefined };
    const c = await tx.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!c) throw new DomainError('COUPON_INVALID', 'Cupom não encontrado.');
    if (consume) await lock(tx as Transaction, 'coupon/' + c.id);
    // Re-read under the checkout lock so concurrent orders cannot exceed the limit.
    const current = consume ? await tx.coupon.findUniqueOrThrow({ where: { id: c.id } }) : c;
    const v = data<Coupon>(current.data),
      now = Date.now();
    if (
      !current.active ||
      current.used >= current.limit ||
      subtotal < v.minimumCents ||
      now < new Date(v.startsAt).getTime() ||
      now > new Date(v.endsAt.length === 10 ? v.endsAt + 'T23:59:59Z' : v.endsAt).getTime()
    )
      throw new DomainError('COUPON_INVALID', 'Este cupom não se aplica ao pedido.');
    const discount = Math.min(
      subtotal,
      v.kind === 'percent' ? Math.round((subtotal * v.amount) / 100) : v.amount,
    );
    if (consume) await tx.coupon.update({ where: { id: c.id }, data: { used: { increment: 1 } } });
    return { discount, couponId: c.id };
  }
  async estimate(value: unknown) {
    const input = checkoutSchema
      .pick({ items: true, coupon: true, shippingQuoteId: true })
      .extend({
        cep: z
          .string()
          .regex(/^\d{5}-?\d{3}$/)
          .optional(),
      })
      .parse(value);
    const items = await this.cart(this.ctx.db, input.items);
    const subtotalCents = items.reduce((n, i) => n + i.unitCents * i.quantity, 0);
    const { discount: discountCents } = await this.coupon(this.ctx.db, input.coupon, subtotalCents);
    let shippingCents = 0;
    if (input.shippingQuoteId) {
      const quote = requireValue(
        await this.ctx.db.shippingQuote.findUnique({ where: { id: input.shippingQuoteId } }),
        'Calcule o frete novamente.',
      );
      if (
        !input.cep ||
        quote.expiresAt < new Date() ||
        quote.cartHash !== (await this.fingerprint(input.items, input.cep))
      )
        throw new DomainError(
          'QUOTE_EXPIRED',
          'Os itens ou a cotação mudaram. Calcule o frete novamente.',
          409,
        );
      shippingCents = quote.amountCents;
    }
    return {
      items,
      subtotalCents,
      discountCents,
      shippingCents,
      totalCents: subtotalCents - discountCents + shippingCents,
    };
  }
  async checkout(actor: Actor | null, visitorKey: string, value: unknown, headerKey?: string) {
    const input = checkoutSchema.parse(value);
    if (this.ctx.config.INTEGRATIONS_MODE === 'live' && !input.address.document)
      throw new DomainError(
        'DOCUMENT_REQUIRED',
        'Informe o CPF ou CNPJ do destinatário para o envio.',
      );
    if (headerKey !== input.idempotencyKey)
      throw new DomainError('IDEMPOTENCY_REQUIRED', 'Confira a chave da solicitação.', 409);
    if (actor && actor.role !== 'customer')
      throw new DomainError(
        'CUSTOMER_ACCOUNT_REQUIRED',
        'Use uma conta de cliente para comprar.',
        403,
      );
    if (input.payment === 'split' && this.ctx.config.SPLIT_PAYMENT_ENABLED !== 'true')
      throw new DomainError(
        'SPLIT_DISABLED',
        'A combinação de pagamentos ainda não foi habilitada.',
        409,
      );
    const actorId = actor?.userId || 'visitor/' + visitorKey,
      requestHash = digest(JSON.stringify(input));
    const result = await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'idempotency/' + input.idempotencyKey);
      const old = await tx.idempotencyRecord.findUnique({ where: { key: input.idempotencyKey } });
      if (old) {
        if (old.actorId !== actorId || old.requestHash !== requestHash || old.scope !== 'checkout')
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'A chave já foi usada para outra solicitação.',
            409,
          );
        return {
          orderId: requireValue(old.resourceId),
          raw: actor?.userId
            ? undefined
            : await this.auth.session(tx, undefined, requireValue(old.resourceId)),
        };
      }
      const { store, workspace } = await settings(tx),
        items = await this.cart(tx, input.items),
        quote = requireValue(
          await tx.shippingQuote.findUnique({
            where: { id: input.shippingQuoteId || input.shipping },
          }),
          'Selecione uma cotação válida.',
        );
      if (
        quote.expiresAt < new Date() ||
        quote.cartHash !== (await this.fingerprint(input.items, input.address.cep, tx)) ||
        (input.shippingServiceId && quote.serviceId !== input.shippingServiceId)
      )
        throw new DomainError(
          'QUOTE_EXPIRED',
          'Os itens ou a cotação mudaram. Calcule o frete novamente.',
          409,
        );
      const subtotal = items.reduce((n, i) => n + i.unitCents * i.quantity, 0);
      const { discount, couponId } = await this.coupon(tx, input.coupon, subtotal, true);
      const total = subtotal - discount + quote.amountCents;
      if (!Number.isSafeInteger(total) || total < 1 || total > 100000000)
        throw new DomainError('TOTAL_INVALID', 'O total do pedido não pode ser processado.');
      if (input.payment === 'split' && (input.pixCents < 1 || input.pixCents >= total))
        throw new DomainError(
          'INVALID_SPLIT',
          'A parte em Pix deve ser positiva e menor que o total.',
        );
      if (input.payment !== 'pix' && !input.paymentToken?.token)
        throw new DomainError('CARD_TOKEN_REQUIRED', 'Preencha o cartão no formulário seguro.');
      const customer =
        actor?.userId && actor.customerId
          ? requireValue(await tx.customer.findUnique({ where: { id: actor.customerId } }))
          : await tx.customer.create({
              data: {
                name: input.address.name,
                email: input.address.email,
                address: json(input.address),
              },
            });
      if (!customer.active)
        throw new DomainError('CUSTOMER_INACTIVE', 'Entre em contato com o atendimento.', 403);
      const quantities = new Map<string, number>();
      for (const i of items)
        quantities.set(i.productId, (quantities.get(i.productId) || 0) + i.quantity);
      for (const [id, quantity] of [...quantities.entries()].sort()) {
        await lock(tx, 'stock/' + id);
        const p = requireValue(await tx.product.findUnique({ where: { id } }));
        if (workspace.inventoryPolicy === 'stock' && p.stock - p.reserved < quantity)
          throw new DomainError(
            'OUT_OF_STOCK',
            'A quantidade disponível mudou. Revise o carrinho.',
            409,
          );
      }
      const unitCost = await productCosts(tx, items);
      const o = await tx.order.create({
        data: {
          customerId: customer.id,
          couponId,
          totalCents: total,
          subtotalCents: subtotal,
          discountCents: discount,
          shippingCents: quote.amountCents,
          address: json(input.address),
          due: addDays(workspace.productionDays),
          data: {
            shippingQuoteId: quote.id,
            shippingServiceId: quote.serviceId,
            consentAt: new Date().toISOString(),
            termsVersion: '2026-11-09',
          },
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitCents: i.unitCents,
              costCents: (unitCost.get(i.productId) || 0) * i.quantity,
              data: json(i),
            })),
          },
          payment: {
            create: {
              method: input.payment,
              amountCents: total,
              due: new Date(Date.now() + 1800000),
              installments: input.paymentToken?.installments || input.installments,
              parts: {
                create:
                  input.payment === 'split'
                    ? [
                        {
                          method: 'card',
                          amountCents: total - input.pixCents,
                          idempotencyKey: input.idempotencyKey + '-card',
                        },
                        {
                          method: 'pix',
                          amountCents: input.pixCents,
                          idempotencyKey: input.idempotencyKey + '-pix',
                        },
                      ]
                    : [
                        {
                          method: input.payment,
                          amountCents: total,
                          idempotencyKey: input.idempotencyKey + '-' + input.payment,
                        },
                      ],
              },
            },
          },
        },
      });
      if (workspace.inventoryPolicy === 'stock')
        for (const [productId, quantity] of quantities) {
          await tx.product.update({
            where: { id: productId },
            data: { reserved: { increment: quantity } },
          });
          await tx.stockReservation.create({
            data: { orderId: o.id, productId, quantity, expiresAt: new Date(Date.now() + 1800000) },
          });
        }
      await tx.idempotencyRecord.create({
        data: {
          key: input.idempotencyKey,
          actorId,
          scope: 'checkout',
          requestHash,
          resourceId: o.id,
          response: { orderId: o.id, paymentAction: { type: 'none' } },
        },
      });
      if (workspace.notificationOrder)
        await this.mail.email(tx, 'order-received/' + o.id, o.id, input.address.email, {
          kind: 'order-received',
          name: input.address.name,
          orderNumber: 'MEO-' + String(o.number).padStart(6, '0'),
          totalCents: total,
          shippingCents: quote.amountCents,
          discountCents: discount,
          items: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            lineTotalCents: i.unitCents * i.quantity,
          })),
          actionUrl: await this.mail.orderUrl(tx, o.id),
        });
      if (workspace.notificationOrder)
        await this.mail.operation(
          tx,
          'new-order/' + o.id,
          o.id,
          'orders',
          'Um novo pedido chegou.',
          'Pedido MEO-' +
            String(o.number).padStart(6, '0') +
            ' aguardando confirmação do pagamento.',
          '/admin/pedidos/' + o.id,
        );
      await audit(tx, actorId, 'Pedido criado', o.id);
      void store;
      return {
        orderId: o.id,
        raw: actor?.userId ? undefined : await this.auth.session(tx, undefined, o.id),
      };
    });
    try {
      await this.payments.start(result.orderId, input.paymentToken);
    } catch {
      /* The durable pending order remains accessible; no financial state is fabricated. */
    }
    return { result: await this.payments.action(result.orderId), raw: result.raw };
  }
  async owned(actor: Actor | null, id: string) {
    if (!actor?.customerId)
      throw new DomainError('UNAUTHORIZED', 'Entre na conta para consultar o pedido.', 401);
    if (actor.guestOrderId && actor.guestOrderId !== id)
      throw new DomainError('NOT_FOUND', 'Pedido não encontrado.', 404);
    const o = await this.ctx.db.order.findFirst({
      where: { id, customerId: actor.customerId },
      include: orderInclude,
    });
    return requireValue(o);
  }
  async retryPix(actor: Actor | null, id: string, rawKey?: string) {
    await this.owned(actor, id);
    const key = z.uuid().parse(rawKey),
      a = actor!;
    await transaction(this.ctx.db, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order/' + id}))`;
      const prior = await tx.idempotencyRecord.findUnique({ where: { key } });
      if (prior) {
        if (prior.actorId !== a.id || prior.scope !== 'retry-pix' || prior.resourceId !== id)
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'A chave já foi utilizada.', 409);
        return;
      }
      const o = requireValue(await tx.order.findUnique({ where: { id }, include: orderInclude })),
        p = requireValue(o.payment);
      if (
        o.status === 'Cancelado' ||
        p.method !== 'pix' ||
        !['Cancelada', 'Recusado'].includes(p.status) ||
        p.parts.some((part) =>
          ['approved', 'unknown', 'creating', 'pending', 'refunded', 'charged_back'].includes(
            part.status,
          ),
        )
      )
        throw new DomainError(
          'PAYMENT_RECONCILIATION_REQUIRED',
          'A cobrança atual ainda precisa ser concluída ou conciliada.',
          409,
        );
      const due = new Date(Date.now() + 1800000),
        reservations = await tx.stockReservation.findMany({
          where: { orderId: id, state: 'released' },
          orderBy: { productId: 'asc' },
        });
      for (const reservation of reservations) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock/' + reservation.productId}))`;
        const product = requireValue(
          await tx.product.findUnique({ where: { id: reservation.productId } }),
        );
        if (
          !product.active ||
          product.archived ||
          product.stock - product.reserved < reservation.quantity
        )
          throw new DomainError(
            'OUT_OF_STOCK',
            'Não há estoque disponível para renovar a reserva.',
            409,
          );
        await tx.product.update({
          where: { id: product.id },
          data: { reserved: { increment: reservation.quantity } },
        });
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { state: 'held', expiresAt: due },
        });
      }
      await tx.paymentIntent.update({
        where: { id: p.id },
        data: {
          status: 'Pendente',
          due,
          parts: {
            create: { method: 'pix', amountCents: p.amountCents, idempotencyKey: 'retry-' + key },
          },
        },
      });
      await tx.idempotencyRecord.create({
        data: {
          key,
          actorId: a.id,
          scope: 'retry-pix',
          resourceId: id,
          requestHash: digest(id),
          response: { orderId: id },
        },
      });
      await audit(tx, a.id, 'Pix renovado após expiração', id);
    });
    await this.payments.start(id);
    return this.payments.action(id);
  }
  async payment(actor: Actor | null, id: string) {
    await this.owned(actor, id);
    return this.payments.action(id);
  }
  async account(actor: Actor | null) {
    if (!actor?.customerId)
      throw new DomainError('UNAUTHORIZED', 'Entre na conta para continuar.', 401);
    if (actor.guestOrderId) {
      const o = await this.owned(actor, actor.guestOrderId),
        a = data<Address>(o.address);
      return {
        customer: {
          ...a,
          id: o.customerId,
          status: 'Ativo' as const,
          created: o.createdAt.toISOString().slice(0, 10),
          notes: '',
        },
        orders: [orderDto(o)],
        charges: [chargeDto(o)].filter(Boolean),
        subscriptions: [],
        tickets: [],
      };
    }
    const c = requireValue(
        await this.ctx.db.customer.findUnique({ where: { id: actor.customerId } }),
      ),
      orders = await this.ctx.db.order.findMany({
        where: { customerId: c.id, ...(actor.guestOrderId ? { id: actor.guestOrderId } : {}) },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      subscriptions = actor.guestOrderId
        ? []
        : await this.ctx.db.subscription.findMany({
            where: { customerId: c.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
      tickets = await this.ctx.db.ticket.findMany({
        where: { customerId: c.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    return {
      customer: customerDto(c),
      orders: orders.map((o) => orderDto(o)),
      charges: orders.map(chargeDto).filter(Boolean),
      subscriptions: subscriptions.map(subscriptionDto),
      tickets: tickets.map((t) => ticketDto(t)),
    };
  }
}

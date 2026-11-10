import type { PaymentToken, Address } from '@maos-em-oracao/contracts';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import type { PaymentResult } from '@maos-em-oracao/integrations';
import type { Context } from './context';
import { Notifications } from './notifications';
import { data, json, requireValue, DomainError, audit } from './shared';
import { orderInclude } from './projections';
import { digest } from './security';
export class PaymentsService {
  async cancelPending(intentId: string, expectedDue?: string) {
    const initial = await transaction(this.ctx.db, async (tx) => {
      const intent = requireValue(
        await tx.paymentIntent.findUnique({
          where: { id: intentId },
          include: { parts: true, order: true },
        }),
      );
      await lock(tx, 'order/' + intent.orderId);
      if (expectedDue && (intent.due.toISOString() !== expectedDue || intent.status === 'Pago'))
        return null;
      if (intent.status !== 'Pago')
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'Expirando' } });
      return intent;
    });
    if (!initial) return;
    for (const part of initial.parts) {
      if (['approved', 'refunded', 'rejected', 'cancelled', 'charged_back'].includes(part.status))
        continue;
      if (part.status === 'created') {
        await this.ctx.db.paymentPart.updateMany({
          where: { id: part.id, status: 'created' },
          data: { status: 'cancelled' },
        });
        continue;
      }
      if (this.ctx.config.INTEGRATIONS_MODE === 'mock') {
        await this.apply({
          id: part.providerId || 'mock-' + part.id,
          reference: part.id,
          status: 'cancelled',
          amountCents: part.amountCents,
          currency: 'BRL',
          refundedCents: part.refundedCents,
          updatedAt: new Date().toISOString(),
          action: { type: 'none' },
        });
      } else {
        let found = part.providerId
          ? await this.ctx.payments.get(part.providerId)
          : (await this.ctx.payments.search(part.id))[0];
        if (!found) throw new Error('PAYMENT_RECONCILIATION_PENDING');
        if (
          found.status === 'pending' ||
          found.status === 'in_process' ||
          found.status === 'authorized'
        )
          found = await this.ctx.payments.cancel(found.id, 'cancel-' + part.id);
        await this.apply(found);
      }
    }
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'order/' + initial.orderId);
      const current = requireValue(
          await tx.paymentIntent.findUnique({ where: { id: intentId }, include: { parts: true } }),
        ),
        captured = current.parts
          .filter((p) => p.status === 'approved' && p.refundedCents < p.amountCents)
          .reduce((n, p) => n + p.amountCents - p.refundedCents, 0);
      if (captured > 0 && captured < current.amountCents)
        await this.mail.event(
          tx,
          'partial-expired-refund/' + intentId,
          'refund-order',
          initial.orderId,
          {
            orderId: initial.orderId,
            reason: 'Pagamento combinado não concluído dentro da validade.',
          },
        );
      if (
        !captured &&
        current.parts.every((p) =>
          ['cancelled', 'rejected', 'refunded', 'charged_back'].includes(p.status),
        )
      ) {
        await tx.paymentIntent.update({
          where: { id: intentId },
          data: {
            status: current.parts.some((p) => p.refundedCents > 0) ? 'Estornado' : 'Cancelada',
          },
        });
        await this.release(tx, initial.orderId);
      }
    });
  }
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  async action(orderId: string) {
    const o = requireValue(
      await this.ctx.db.order.findUnique({ where: { id: orderId }, include: orderInclude }),
    );
    const part = o.payment?.parts.find(
      (p) => p.method === 'pix' && ['pending', 'created', 'creating'].includes(p.status),
    );
    return {
      orderId: o.id,
      ...(o.subscriptionId ? { subscriptionId: o.subscriptionId } : {}),
      paymentAction: part?.action
        ? data<import('@maos-em-oracao/contracts').PaymentAction>(part.action)
        : { type: 'none' as const },
    };
  }
  async start(orderId: string, card?: PaymentToken) {
    const order = requireValue(
      await this.ctx.db.order.findUnique({ where: { id: orderId }, include: orderInclude }),
    );
    if (order.status === 'Cancelado') return this.action(orderId);
    const address = data<Address>(order.address);
    if (order.payment?.status !== 'Pendente') return this.action(orderId);
    const parts = [...(order.payment?.parts || [])].sort((a, b) =>
      a.method === 'card' ? -1 : b.method === 'card' ? 1 : 0,
    );
    for (const p of parts) {
      if (p.status !== 'created') continue;
      if (
        p.method === 'pix' &&
        parts.some(
          (c) =>
            c.method === 'card' && ['created', 'creating', 'pending', 'unknown'].includes(c.status),
        )
      )
        break;
      if (p.method === 'card' && !card?.token) continue;
      const claimed = await this.ctx.db.paymentPart.updateMany({
        where: { id: p.id, status: 'created', intent: { status: 'Pendente' } },
        data: {
          status: 'creating',
          requestHash: digest(
            JSON.stringify({
              amount: p.amountCents,
              method: p.method,
              reference: p.id,
              token: card?.token ? digest(card.token) : undefined,
            }),
          ),
        },
      });
      if (!claimed.count) continue;
      try {
        const result = await this.ctx.payments.create({
          id: p.id,
          key: p.idempotencyKey,
          method: p.method as 'pix' | 'card',
          amountCents: p.amountCents,
          email: card?.payer.email || address.email,
          description: 'Pedido MEO-' + String(order.number).padStart(6, '0'),
          card: p.method === 'card' ? card : undefined,
        });
        await this.apply(result);
        p.status = result.status;
        if (result.action.type === 'pix')
          await transaction(this.ctx.db, async (tx) => {
            await this.mail.email(tx, 'pix-ready/' + p.id, order.id, address.email, {
              kind: 'pix-pending',
              name: address.name,
              orderNumber: 'MEO-' + String(order.number).padStart(6, '0'),
              totalCents: p.amountCents,
              actionUrl: await this.mail.orderUrl(tx, order.id),
              expiresAtLabel:
                new Date(
                  result.action.type === 'pix' ? result.action.expiresAt : new Date(),
                ).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)',
            });
          });
        if (result.status === 'rejected') {
          await this.ctx.db.paymentPart.updateMany({
            where: { intentId: p.intentId, status: 'created' },
            data: { status: 'cancelled' },
          });
          await this.apply(result);
          break;
        }
      } catch (error) {
        await this.ctx.db.paymentPart.updateMany({
          where: { id: p.id, status: 'creating' },
          data: { status: 'unknown' },
        });
        await transaction(this.ctx.db, async (tx) => {
          await this.mail.event(tx, 'reconcile/' + p.id, 'payment-reconcile', p.id, {
            partId: p.id,
          });
          await audit(tx, 'system', 'Pagamento requer conciliação', p.id);
        });
        throw error;
      }
    }
    return this.action(orderId);
  }
  async apply(result: PaymentResult) {
    return transaction(this.ctx.db, async (tx) => {
      const part = requireValue(
        await tx.paymentPart.findFirst({
          where: { OR: [{ id: result.reference }, { providerId: result.id }] },
          include: { intent: { include: { order: true } } },
        }),
        'Pagamento não associado à loja.',
      );
      await lock(tx, 'order/' + part.intent.orderId);
      if (
        result.reference !== part.id ||
        result.currency !== 'BRL' ||
        result.amountCents !== part.amountCents ||
        (part.providerId && part.providerId !== result.id)
      )
        throw new DomainError(
          'PAYMENT_MISMATCH',
          'Dados do pagamento não correspondem ao pedido.',
          409,
        );
      const updatedAt = new Date(result.updatedAt);
      if (!Number.isFinite(updatedAt.getTime()))
        throw new DomainError('PAYMENT_DATE', 'Data do provedor inválida.');
      if (part.providerUpdatedAt && updatedAt < part.providerUpdatedAt) return;
      const status = ['approved', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(
        result.status,
      )
        ? result.status
        : 'pending';
      if (
        ['refunded', 'charged_back'].includes(part.status) &&
        !['refunded', 'charged_back'].includes(status)
      )
        return;
      if (part.status === 'approved' && ['pending', 'rejected', 'cancelled'].includes(status))
        return;
      const refunded =
        status === 'charged_back'
          ? part.amountCents
          : Math.max(part.refundedCents, result.refundedCents);
      if (refunded > part.amountCents)
        throw new DomainError('REFUND_MISMATCH', 'Valor de estorno inválido.', 409);
      await tx.paymentPart.update({
        where: { id: part.id },
        data: {
          providerId: result.id,
          status,
          action: json(result.action),
          refundedCents: refunded,
          providerUpdatedAt: updatedAt,
          ...(result.feeCents !== undefined ? { feeCents: result.feeCents } : {}),
        },
      });
      if (
        result.action.type === 'pix' &&
        status === 'pending' &&
        part.intent.status === 'Pendente'
      ) {
        const due = new Date(result.action.expiresAt);
        if (Number.isFinite(due.getTime())) {
          await tx.paymentIntent.update({ where: { id: part.intentId }, data: { due } });
          await tx.stockReservation.updateMany({
            where: { orderId: part.intent.orderId, state: 'held' },
            data: { expiresAt: due },
          });
        }
      }
      if (result.feeCents !== undefined && result.feeCents !== part.feeCents)
        await tx.ledgerEntry.upsert({
          where: { eventKey: 'fee/' + part.id + '/' + result.feeCents },
          create: {
            eventKey: 'fee/' + part.id + '/' + result.feeCents,
            intentId: part.intentId,
            kind: 'fee',
            amountCents: -(result.feeCents - part.feeCents),
          },
          update: {},
        });
      if (status === 'approved' || refunded > 0)
        await tx.ledgerEntry.upsert({
          where: { eventKey: 'payment/' + part.id },
          create: {
            eventKey: 'payment/' + part.id,
            intentId: part.intentId,
            kind: 'payment',
            amountCents: part.amountCents,
          },
          update: {},
        });
      if (refunded > part.refundedCents)
        await tx.ledgerEntry.upsert({
          where: { eventKey: `refund/${part.id}/${refunded}` },
          create: {
            eventKey: `refund/${part.id}/${refunded}`,
            intentId: part.intentId,
            kind: status === 'charged_back' ? 'chargeback' : 'refund',
            amountCents: -(refunded - part.refundedCents),
          },
          update: {},
        });
      const all = await tx.paymentPart.findMany({ where: { intentId: part.intentId } }),
        approved = all
          .filter((p) => p.status === 'approved')
          .reduce((n, p) => n + p.amountCents, 0),
        refundedTotal = all.reduce((n, p) => n + p.refundedCents, 0),
        intent = part.intent,
        order = part.intent.order;
      if (status === 'approved' && order.status === 'Cancelado' && refunded < part.amountCents)
        await this.mail.event(tx, 'late-cancelled-payment/' + order.id, 'refund-order', order.id, {
          orderId: order.id,
          reason: 'Pagamento confirmado após cancelamento do pedido.',
        });
      if (
        status === 'approved' &&
        intent.method === 'split' &&
        intent.status !== 'Expirando' &&
        order.status !== 'Cancelado' &&
        all.some((p) => p.method === 'pix' && p.status === 'created')
      )
        await this.mail.event(tx, 'split-pix/' + intent.id, 'payment-create-pix', order.id, {
          orderId: order.id,
        });
      const captured = all
        .filter((p) => ['approved', 'refunded', 'charged_back'].includes(p.status))
        .reduce((n, p) => n + p.amountCents, 0);
      if (
        captured > 0 &&
        refundedTotal >= captured &&
        all.every((p) =>
          ['approved', 'refunded', 'charged_back', 'cancelled', 'rejected'].includes(p.status),
        )
      ) {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'Estornado' } });
        if (!['Enviado', 'Entregue'].includes(order.status))
          await tx.order.update({ where: { id: order.id }, data: { status: 'Cancelado' } });
        await this.release(tx, order.id);
      } else if (
        approved === intent.amountCents &&
        intent.status !== 'Pago' &&
        order.status !== 'Cancelado'
      ) {
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'Pago', paidAt: new Date() },
        });
        await tx.order.update({ where: { id: order.id }, data: { status: 'Confirmado' } });
        const reservations = await tx.stockReservation.findMany({ where: { orderId: order.id } });
        let stockReady = true;
        for (const r of [...reservations].sort((a, b) => a.productId.localeCompare(b.productId))) {
          await lock(tx, 'stock/' + r.productId);
          const product = requireValue(await tx.product.findUnique({ where: { id: r.productId } }));
          if (r.state === 'released' && product.stock - product.reserved < r.quantity)
            stockReady = false;
        }
        for (const r of reservations) {
          if (!stockReady) break;
          await lock(tx, 'stock/' + r.productId);
          const product = requireValue(await tx.product.findUnique({ where: { id: r.productId } }));
          if (r.state === 'held') {
            await tx.product.update({
              where: { id: r.productId },
              data: { stock: { decrement: r.quantity }, reserved: { decrement: r.quantity } },
            });
            await tx.stockReservation.update({ where: { id: r.id }, data: { state: 'consumed' } });
            await tx.stockMovement.create({
              data: {
                productId: r.productId,
                delta: -r.quantity,
                reason: 'Pedido pago ' + order.id,
                actorId: 'system',
              },
            });
          } else if (r.state === 'released') {
            if (product.stock - product.reserved < r.quantity) {
              stockReady = false;
              break;
            }
            await tx.product.update({
              where: { id: r.productId },
              data: { stock: { decrement: r.quantity } },
            });
            await tx.stockReservation.update({ where: { id: r.id }, data: { state: 'consumed' } });
          }
        }
        if (stockReady) await this.production(tx, order.id);
        else {
          await tx.order.update({
            where: { id: order.id },
            data: {
              notes:
                'Pagamento recebido após expiração da reserva; compensação financeira pendente.',
            },
          });
          await this.mail.event(tx, 'late-stock-refund/' + order.id, 'refund-order', order.id, {
            orderId: order.id,
            reason: 'Estoque indisponível após expiração da reserva.',
          });
        }
        const a = data<Address>(order.address);
        await this.mail.email(tx, 'payment-approved/' + intent.id, order.id, a.email, {
          kind: 'payment-approved',
          name: a.name,
          totalCents: order.totalCents,
          orderNumber: 'MEO-' + String(order.number).padStart(6, '0'),
          actionUrl: await this.mail.orderUrl(tx, order.id),
        });
        if (order.subscriptionId) {
          await tx.subscription.updateMany({
            where: { id: order.subscriptionId, status: 'Pagamento pendente' },
            data: { status: 'Ativa' },
          });
          await tx.subscriptionCycle.updateMany({
            where: { orderId: order.id },
            data: { state: 'paid' },
          });
        }
      } else if (
        all.every((p) => ['rejected', 'cancelled'].includes(p.status)) &&
        !approved &&
        intent.status !== 'Pago'
      ) {
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: all.some((p) => p.status === 'rejected') ? 'Recusado' : 'Cancelada' },
        });
        await this.release(tx, order.id);
        const a = data<Address>(order.address);
        await this.mail.email(tx, 'payment-failed/' + intent.id, order.id, a.email, {
          kind: 'payment-failed',
          name: a.name,
          reference: 'seu pedido MEO-' + String(order.number).padStart(6, '0'),
          actionUrl: await this.mail.orderUrl(tx, order.id),
        });
      }
    });
  }
  async production(tx: Transaction, orderId: string) {
    const order = requireValue(
      await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } }),
    );
    if (
      order.payment?.status !== 'Pago' ||
      ['Cancelado', 'Enviado', 'Entregue'].includes(order.status)
    )
      throw new DomainError(
        'PAYMENT_REQUIRED',
        'A produção exige pagamento integral aprovado.',
        409,
      );
    await tx.productionJob.upsert({
      where: { orderId },
      create: {
        orderId,
        assignee: 'A definir',
        hours: 6,
        due: order.due,
        priority: order.priority,
        data: {},
      },
      update: {},
    });
  }
  async release(tx: Transaction, orderId: string) {
    const rows = await tx.stockReservation.findMany({ where: { orderId, state: 'held' } });
    for (const r of rows) {
      await lock(tx, 'stock/' + r.productId);
      await tx.product.update({
        where: { id: r.productId },
        data: { reserved: { decrement: r.quantity } },
      });
      await tx.stockReservation.update({ where: { id: r.id }, data: { state: 'released' } });
    }
  }
  async refund(orderId: string, reason: string) {
    const order = requireValue(
      await this.ctx.db.order.findUnique({ where: { id: orderId }, include: orderInclude }),
    );
    if (!order.payment) throw new DomainError('NO_PAYMENT', 'Pedido sem pagamento.');
    for (const part of order.payment.parts) {
      if (part.status !== 'approved' || part.refundedCents >= part.amountCents) continue;
      const key = 'refund/' + part.id;
      const refund = await this.ctx.db.refund.upsert({
        where: { key },
        create: {
          key,
          partId: part.id,
          amountCents: part.amountCents - part.refundedCents,
          reason,
        },
        update: {},
      });
      if (refund.status === 'approved') continue;
      if (!part.providerId)
        throw new DomainError('PAYMENT_UNKNOWN', 'Concilie o pagamento antes de estornar.', 409);
      const result = await this.ctx.payments.refund(
        part.providerId,
        refund.amountCents,
        refund.key,
      );
      if (result.status && result.status !== 'approved')
        throw new DomainError('REFUND_PENDING', 'O provedor ainda não confirmou o estorno.', 409);
      await this.ctx.db.refund.update({
        where: { id: refund.id },
        data: { providerId: String(result.id), status: 'approved' },
      });
      if (this.ctx.config.INTEGRATIONS_MODE === 'mock')
        await this.apply({
          id: part.providerId,
          reference: part.id,
          status: 'refunded',
          amountCents: part.amountCents,
          currency: 'BRL',
          updatedAt: new Date().toISOString(),
          refundedCents: part.amountCents,
          action: { type: 'none' },
        });
      else await this.apply(await this.ctx.payments.get(part.providerId));
    }
    await transaction(this.ctx.db, async (tx) => {
      await tx.paymentIntent.update({
        where: { id: order.payment!.id },
        data: { refundReason: reason },
      });
      const a = data<Address>(order.address);
      const parts = await tx.paymentPart.findMany({ where: { intentId: order.payment!.id } });
      const refunded = parts.reduce((n, p) => n + p.refundedCents, 0);
      if (refunded <= 0) return;
      await this.mail.email(
        tx,
        'refund-confirmed/' + order.payment!.id + '/' + refunded,
        order.id,
        a.email,
        {
          kind: 'refund-confirmed',
          name: a.name,
          orderNumber: 'MEO-' + String(order.number).padStart(6, '0'),
          totalCents: order.totalCents,
          refundedCents: refunded,
          actionUrl: await this.mail.orderUrl(tx, order.id),
        },
      );
    });
  }
  async mockApprove(intentId: string) {
    if (this.ctx.config.INTEGRATIONS_MODE !== 'mock')
      throw new DomainError(
        'PROVIDER_CONFIRMATION_REQUIRED',
        'Pagamentos reais são confirmados pelo provedor.',
        409,
      );
    const intent = requireValue(
      await this.ctx.db.paymentIntent.findUnique({
        where: { id: intentId },
        include: { parts: true },
      }),
    );
    for (const p of intent.parts)
      if (!['refunded', 'charged_back'].includes(p.status))
        await this.apply({
          id: p.providerId || 'mock-' + p.id,
          reference: p.id,
          status: 'approved',
          currency: 'BRL',
          amountCents: p.amountCents,
          updatedAt: new Date().toISOString(),
          refundedCents: 0,
          action: { type: 'none' },
        });
  }
}

import { z } from 'zod';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import {
  subscriptionSchema,
  addressSchema,
  type Address,
  type CartItem,
  type StoreSettings,
} from '@maos-em-oracao/contracts';
import type { PaymentResult } from '@maos-em-oracao/integrations';
import type { Context } from './context';
import { settings } from './context';
import { Notifications } from './notifications';
import { OrdersService, productCosts } from './orders';
import {
  requireActor,
  requireValue,
  DomainError,
  type Actor,
  data,
  json,
  month,
  nextMonth,
  addDays,
  day,
  audit,
} from './shared';
import { digest } from './security';
export class SubscriptionsService {
  readonly orders: OrdersService;
  readonly mail: Notifications;
  constructor(private ctx: Context) {
    this.orders = new OrdersService(ctx);
    this.mail = new Notifications(ctx);
  }
  async subscribe(actor: Actor | null, value: unknown, headerKey?: string) {
    const a = requireActor(actor);
    if (!a.userId || !a.customerId || a.role !== 'customer')
      throw new DomainError(
        'CUSTOMER_ACCOUNT_REQUIRED',
        'Crie uma conta de cliente para assinar o clube.',
        403,
      );
    const input = subscriptionSchema.parse(value);
    if (this.ctx.config.INTEGRATIONS_MODE === 'live' && !input.address.document)
      throw new DomainError(
        'DOCUMENT_REQUIRED',
        'Informe o CPF ou CNPJ do destinatário para o envio.',
      );
    if (headerKey !== input.idempotencyKey)
      throw new DomainError('IDEMPOTENCY_REQUIRED', 'Confira a chave da solicitação.', 409);
    if (input.payment === 'card' && !input.paymentToken?.token)
      throw new DomainError('CARD_TOKEN_REQUIRED', 'Preencha o cartão no formulário seguro.');
    const fingerprint = digest(JSON.stringify(input)),
      s = await settings(this.ctx.db);
    const replay = await this.ctx.db.idempotencyRecord.findUnique({
      where: { key: input.idempotencyKey },
    });
    if (
      replay &&
      (replay.actorId !== a.userId ||
        replay.scope !== 'subscribe' ||
        replay.requestHash !== fingerprint)
    )
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'A chave já foi usada em outra solicitação.',
        409,
      );
    const contents = s.store.profiles[input.profile];
    if (!replay && !contents.length)
      throw new DomainError(
        'EDITION_UNAVAILABLE',
        'A curadoria deste perfil ainda não está disponível.',
        409,
      );
    const quotes = replay
      ? []
      : await this.orders.quote({
          cep: input.address.cep,
          items: contents.map((productId) => ({ productId, quantity: 1, sizeIndex: 0 })),
        });
    const quote = replay
      ? null
      : requireValue(
          quotes.sort((x, y) => x.cents - y.cents)[0],
          'Não há envio disponível para este endereço.',
        );
    const sub = await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'idempotency/' + input.idempotencyKey);
      const old = await tx.idempotencyRecord.findUnique({ where: { key: input.idempotencyKey } });
      if (old) {
        if (
          old.actorId !== a.userId ||
          old.scope !== 'subscribe' ||
          old.requestHash !== fingerprint
        )
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'A chave já foi usada em outra solicitação.',
            409,
          );
        return requireValue(
          await tx.subscription.findUnique({ where: { id: requireValue(old.resourceId) } }),
        );
      }
      const created = await tx.subscription.create({
        data: {
          customerId: a.customerId!,
          status: 'Pagamento pendente',
          payment: input.payment,
          profile: input.profile,
          finish: input.finish,
          priceCents: s.store.priceCents,
          nextRenewal: nextMonth(new Date()),
          nextShipment: addDays(s.workspace.productionDays),
          address: json(input.address),
          history: [
            {
              date: day(new Date()),
              label: 'Adesão solicitada; aguardando confirmação do pagamento.',
            },
          ],
        },
      });
      await this.cycle(tx, created.id, month(), requireValue(quote).id, s.store);
      await tx.idempotencyRecord.create({
        data: {
          key: input.idempotencyKey,
          actorId: a.userId!,
          scope: 'subscribe',
          requestHash: fingerprint,
          resourceId: created.id,
          response: { subscriptionId: created.id },
        },
      });
      await audit(tx, a.id, 'Adesão ao clube criada', created.id);
      return created;
    });
    if (input.payment === 'card' && !sub.providerId && sub.providerState === 'pending') {
      const claimed = await this.ctx.db.subscription.updateMany({
        where: { id: sub.id, providerState: 'pending', providerId: null },
        data: { providerState: 'authorizing' },
      });
      if (claimed.count)
        try {
          const result = await this.ctx.payments.authorize({
            id: sub.id,
            key: input.idempotencyKey,
            amountCents: sub.priceCents,
            email: input.paymentToken!.payer.email,
            card: input.paymentToken!,
          });
          await transaction(this.ctx.db, async (tx) => {
            await tx.subscription.update({
              where: { id: sub.id },
              data: { providerId: result.id, providerState: result.status },
            });
            await this.mail.email(tx, 'club-welcome/' + sub.id, sub.id, input.address.email, {
              kind: 'club-welcome',
              name: input.address.name,
              planName: s.store.clubName,
              totalCents: sub.priceCents,
              actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/assinatura',
            });
          });
        } catch {
          await this.ctx.db.subscription.update({
            where: { id: sub.id },
            data: { providerState: 'authorization_unknown' },
          });
        }
    }
    const cycle = requireValue(
      await this.ctx.db.subscriptionCycle.findFirst({
        where: { subscriptionId: sub.id },
        orderBy: { createdAt: 'asc' },
      }),
    );
    if (input.payment === 'pix')
      try {
        await this.orders.payments.start(requireValue(cycle.orderId));
      } catch {}
    return this.orders.payments.action(requireValue(cycle.orderId));
  }
  async cycle(
    tx: Transaction,
    subscriptionId: string,
    competence: string,
    quoteId?: string,
    storeSettings?: StoreSettings,
  ) {
    await lock(tx, 'subscription-cycle/' + subscriptionId + '/' + competence);
    const existing = await tx.subscriptionCycle.findUnique({
      where: { subscriptionId_competence: { subscriptionId, competence } },
    });
    if (existing) return existing;
    const sub = requireValue(await tx.subscription.findUnique({ where: { id: subscriptionId } }));
    if (sub.status === 'Cancelada' || sub.status === 'Pausada' || sub.skipMonth === competence)
      throw new DomainError(
        'SUBSCRIPTION_INACTIVE',
        'A assinatura não permite gerar esta edição.',
        409,
      );
    const s = await settings(tx),
      store = storeSettings || s.store,
      edition = await tx.clubEdition.findFirst({ where: { month: competence, active: true } }),
      profiles = edition
        ? data<{ profiles: StoreSettings['profiles'] }>(edition.data).profiles
        : store.editionMonth === competence
          ? store.profiles
          : null;
    if (!profiles)
      throw new DomainError(
        'EDITION_UNAVAILABLE',
        'Cadastre e ative a edição antes de gerar este ciclo.',
        409,
      );
    const ids = profiles[sub.profile as keyof typeof profiles];
    if (!ids?.length)
      throw new DomainError('EDITION_EMPTY', 'A edição não possui peças para este perfil.', 409);
    const items: CartItem[] = [];
    let assigned = 0;
    for (let i = 0; i < ids.length; i++) {
      const p = requireValue(
        await tx.product.findFirst({ where: { id: ids[i], active: true, archived: false } }),
        'Uma peça da edição não está disponível.',
      );
      const d = data<{ colors: string[]; sizes: string[]; image: string; imageIndex: number }>(
          p.data,
        ),
        unit =
          i === ids.length - 1
            ? sub.priceCents - assigned
            : Math.floor(sub.priceCents / ids.length);
      assigned += unit;
      const color =
        sub.finish === 'Surpresa'
          ? d.colors[0]
          : d.colors.includes(sub.finish)
            ? sub.finish
            : d.colors[0];
      items.push({
        key: p.id + '|club|' + competence,
        productId: p.id,
        name: p.name,
        image: d.image,
        imageIndex: d.imageIndex,
        color,
        size: d.sizes[0],
        sizeIndex: 0,
        unitCents: unit,
        quantity: 1,
        dedication: '',
      });
    }
    const quantities = new Map<string, number>();
    for (const item of items)
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + 1);
    if (s.workspace.inventoryPolicy === 'stock')
      for (const [id, q] of [...quantities.entries()].sort()) {
        await lock(tx, 'stock/' + id);
        const p = requireValue(await tx.product.findUnique({ where: { id } }));
        if (p.stock - p.reserved < q)
          throw new DomainError('OUT_OF_STOCK', 'Não há saldo suficiente para esta edição.', 409);
      }
    const unitCost = await productCosts(tx, items);
    const o = await tx.order.create({
      data: {
        customerId: sub.customerId,
        subscriptionId: sub.id,
        type: 'Clube',
        totalCents: sub.priceCents,
        subtotalCents: sub.priceCents,
        discountCents: 0,
        shippingCents: 0,
        address: json(sub.address),
        data: json({
          edition: edition?.name || store.edition,
          competence,
          shippingQuoteId: quoteId,
        }),
        due: addDays(s.workspace.productionDays),
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitCents: i.unitCents,
            costCents: (unitCost.get(i.productId + '/' + i.sizeIndex) || 0) * i.quantity,
            data: json(i),
          })),
        },
        payment: {
          create: {
            method: sub.payment,
            amountCents: sub.priceCents,
            due: sub.payment === 'pix' ? addDays(3) : addDays(7),
            parts: {
              create: {
                method: sub.payment,
                amountCents: sub.priceCents,
                idempotencyKey: 'club-' + sub.id + '-' + competence,
              },
            },
          },
        },
      },
    });
    if (s.workspace.inventoryPolicy === 'stock')
      for (const [productId, quantity] of quantities) {
        await tx.product.update({
          where: { id: productId },
          data: { reserved: { increment: quantity } },
        });
        await tx.stockReservation.create({
          data: { orderId: o.id, productId, quantity, expiresAt: addDays(3) },
        });
      }
    return tx.subscriptionCycle.create({
      data: { subscriptionId: sub.id, competence, editionId: edition?.id, orderId: o.id },
    });
  }
  async change(actor: Actor | null, id: string, value: unknown, staff = false) {
    const a = requireActor(actor),
      input = z
        .object({
          action: z.enum(['pause', 'resume', 'skip', 'cancel', 'preferences']),
          reason: z.string().max(500).optional(),
          profile: z.enum(['Católica', 'Evangélica', 'Cristã']).optional(),
          finish: z.enum(['Marfim', 'Terracota', 'Surpresa']).optional(),
          address: addressSchema.optional(),
          payment: z.enum(['card', 'pix']).optional(),
        })
        .parse(value);
    const sub = requireValue(
      await this.ctx.db.subscription.findFirst({
        where: { id, ...(!staff ? { customerId: a.customerId || 'none' } : {}) },
      }),
    );
    if (sub.status === 'Cancelada')
      throw new DomainError('SUBSCRIPTION_CLOSED', 'A assinatura está cancelada.', 409);
    if (input.action === 'preferences') {
      if (input.payment && input.payment !== sub.payment)
        throw new DomainError(
          'PAYMENT_CHANGE_REQUIRES_TOKEN',
          'A mudança do meio de pagamento exige uma nova autorização segura.',
        );
      await this.ctx.db.subscription.update({
        where: { id },
        data: {
          profile: input.profile,
          finish: input.finish,
          address: input.address ? json(input.address) : undefined,
          version: { increment: 1 },
        },
      });
      await audit(this.ctx.db, a.id, 'Preferências dos próximos ciclos atualizadas', id);
      return;
    }
    if (sub.payment === 'card') {
      if (!sub.providerId)
        throw new DomainError(
          'SUBSCRIPTION_SYNC_REQUIRED',
          'A autorização do clube ainda precisa ser conciliada.',
          409,
        );
      const target =
        input.action === 'resume'
          ? 'authorized'
          : input.action === 'cancel'
            ? 'cancelled'
            : 'paused';
      const result = await this.ctx.payments.updateSubscription(
        sub.providerId,
        target,
        'subscription-' + sub.id + '-' + sub.version + '-' + input.action,
      );
      if (result.status !== target)
        throw new DomainError(
          'SUBSCRIPTION_SYNC_REQUIRED',
          'Aguarde a confirmação do provedor.',
          409,
        );
    }
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'subscription/' + id);
      const current = requireValue(await tx.subscription.findUnique({ where: { id } }));
      const status =
          input.action === 'resume' ? 'Ativa' : input.action === 'cancel' ? 'Cancelada' : 'Pausada',
        skip = input.action === 'skip' ? month(current.nextRenewal) : null,
        next =
          input.action === 'skip'
            ? nextMonth(current.nextRenewal)
            : input.action === 'resume' && current.nextRenewal < new Date()
              ? new Date()
              : current.nextRenewal;
      await tx.subscription.update({
        where: { id },
        data: {
          status,
          providerState:
            status === 'Cancelada' ? 'cancelled' : status === 'Pausada' ? 'paused' : 'authorized',
          skipMonth: skip,
          nextRenewal: next,
          history: json([
            {
              date: day(new Date()),
              label:
                input.action === 'skip'
                  ? `Edição ${skip} pulada; retomada agendada para ${day(next)}.`
                  : status + ' confirmada.',
            },
            ...data<import('@maos-em-oracao/contracts').Subscription['history']>(current.history),
          ]),
          version: { increment: 1 },
        },
      });
      const address = data<Address>(current.address);
      await this.mail.email(tx, 'club-status/' + id + '/' + current.version, id, address.email, {
        kind: 'club-status',
        name: address.name,
        status:
          input.action === 'resume'
            ? 'resumed'
            : input.action === 'cancel'
              ? 'cancelled'
              : input.action === 'skip'
                ? 'skipped'
                : 'paused',
        effectiveLabel:
          input.action === 'skip' ? `${skip}; retomada em ${day(next)}` : day(new Date()),
        actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/assinatura',
      });
      await audit(tx, a.id, 'Assinatura: ' + input.action, id);
    });
  }
  async recurringPayment(authorizedId: string) {
    const invoice = await this.ctx.payments.authorizedPayment(authorizedId),
      sub = requireValue(
        await this.ctx.db.subscription.findUnique({
          where: { providerId: invoice.preapproval_id },
        }),
        'Assinatura não associada à loja.',
      );
    if (!invoice.payment?.id) return;
    const payment = await this.ctx.payments.get(String(invoice.payment.id));
    if (payment.amountCents !== sub.priceCents || payment.currency !== 'BRL')
      throw new DomainError(
        'SUBSCRIPTION_PAYMENT_MISMATCH',
        'A mensalidade não corresponde ao contrato.',
        409,
      );
    const known = await this.ctx.db.paymentPart.findUnique({
      where: { providerId: payment.id },
      include: { intent: { include: { order: true } } },
    });
    if (known) {
      if (known.intent.order.subscriptionId !== sub.id)
        throw new DomainError('PAYMENT_MISMATCH', 'Mensalidade associada a outro contrato.', 409);
      await this.orders.payments.apply({ ...payment, reference: known.id });
      if (payment.status === 'approved')
        await this.paidInvoice(
          sub.id,
          payment.id,
          new Date(invoice.date_created || payment.updatedAt),
        );
      return;
    }
    const competence = month(new Date(invoice.date_created || payment.updatedAt));
    const c = await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'subscription-cycle/' + sub.id + '/' + competence);
      const current = requireValue(await tx.subscription.findUnique({ where: { id: sub.id } }));
      const existing = await tx.subscriptionCycle.findUnique({
        where: { subscriptionId_competence: { subscriptionId: sub.id, competence } },
        include: { order: { include: { payment: { include: { parts: true } } } } },
      });
      const previousId =
        existing?.providerPaymentId ||
        existing?.order?.payment?.parts.find((p) => p.providerId)?.providerId;
      const reason =
        current.status === 'Cancelada' ||
        current.status === 'Pausada' ||
        current.skipMonth === competence
          ? 'Cobrança recebida para ciclo suspenso ou cancelado.'
          : previousId && previousId !== payment.id
            ? 'Cobrança duplicada para a mesma competência.'
            : null;
      if (reason) {
        await this.exception(tx, sub.id, payment, reason);
        return null;
      }
      let cycle;
      try {
        cycle = existing || (await this.cycle(tx, sub.id, competence));
      } catch (error) {
        if (
          error instanceof DomainError &&
          ['EDITION_UNAVAILABLE', 'EDITION_EMPTY', 'OUT_OF_STOCK', 'NOT_FOUND'].includes(error.code)
        ) {
          await this.exception(
            tx,
            sub.id,
            payment,
            'Curadoria ou estoque indisponível para a competência.',
          );
          return null;
        }
        throw error;
      }
      await tx.subscriptionCycle.update({
        where: { id: cycle.id },
        data: { providerPaymentId: payment.id },
      });
      return cycle;
    });
    if (!c) return;
    const p = requireValue(
      await this.ctx.db.paymentPart.findFirst({
        where: { intent: { orderId: requireValue(c.orderId) } },
      }),
    );
    if (payment.reference && ![sub.id, p.id].includes(payment.reference))
      throw new DomainError(
        'PAYMENT_MISMATCH',
        'Referência da mensalidade não corresponde à assinatura.',
        409,
      );
    // Mapping is authorized by the invoice.preapproval_id chain, not by a browser-provided reference.
    await this.orders.payments.apply({ ...payment, reference: p.id });
    await this.ctx.db.subscriptionCycle.update({
      where: { id: c.id },
      data: { providerPaymentId: payment.id },
    });
    if (payment.status === 'approved')
      await this.paidInvoice(
        sub.id,
        payment.id,
        new Date(invoice.date_created || payment.updatedAt),
      );
  }
  private async exception(
    tx: Transaction,
    subscriptionId: string,
    payment: PaymentResult,
    reason: string,
  ) {
    if (payment.status !== 'approved') return;
    const exception = await tx.paymentException.upsert({
      where: { providerId: payment.id },
      create: { providerId: payment.id, subscriptionId, amountCents: payment.amountCents, reason },
      update: {},
    });
    await tx.ledgerEntry.upsert({
      where: { eventKey: 'exception-payment/' + exception.id },
      create: {
        eventKey: 'exception-payment/' + exception.id,
        kind: 'payment',
        amountCents: payment.amountCents,
      },
      update: {},
    });
    await this.mail.event(tx, 'refund-orphan/' + exception.id, 'refund-orphan', exception.id, {
      exceptionId: exception.id,
    });
  }
  private async paidInvoice(id: string, paymentId: string, billedAt: Date) {
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'subscription/' + id);
      const current = requireValue(await tx.subscription.findUnique({ where: { id } }));
      const next = nextMonth(billedAt),
        last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(current.createdAt.getUTCDate(), last));
      await tx.subscription.update({
        where: { id },
        data: {
          status: ['Cancelada', 'Pausada'].includes(current.status) ? current.status : 'Ativa',
          nextRenewal: current.nextRenewal > billedAt ? current.nextRenewal : next,
        },
      });
      const address = data<Address>(current.address);
      await this.mail.email(tx, 'club-renewed/' + paymentId, id, address.email, {
        kind: 'club-renewed',
        name: address.name,
        edition: month(billedAt),
        totalCents: current.priceCents,
        actionUrl: this.ctx.config.PUBLIC_WEB_URL + '/conta/assinatura',
      });
    });
  }
  async tick() {
    const due = await this.ctx.db.subscription.findMany({
      where: { nextRenewal: { lte: new Date() }, status: { in: ['Ativa', 'Pausada'] } },
      take: 100,
    });
    for (const sub of due) {
      if (sub.status === 'Pausada' && sub.skipMonth) {
        await this.change(
          {
            id: 'system',
            name: 'Sistema',
            email: 'system@loja.example',
            role: 'admin',
            permissions: [],
            demo: false,
            owner: true,
          },
          sub.id,
          { action: 'resume' },
          true,
        );
        continue;
      }
      if (sub.status !== 'Ativa' || sub.payment !== 'pix') continue;
      try {
        const c = await transaction(this.ctx.db, (tx) =>
          this.cycle(tx, sub.id, month(sub.nextRenewal)),
        );
        if (c.orderId) await this.orders.payments.start(c.orderId);
        await this.ctx.db.subscription.update({
          where: { id: sub.id },
          data: { nextRenewal: nextMonth(sub.nextRenewal) },
        });
      } catch {
        await audit(this.ctx.db, 'system', 'Ciclo do clube requer revisão', sub.id);
      }
    }
  }
}

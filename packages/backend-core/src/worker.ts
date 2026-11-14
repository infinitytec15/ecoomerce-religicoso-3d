import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { Resend } from 'resend';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { transaction, lock } from '@maos-em-oracao/database';
import { ProviderError } from '@maos-em-oracao/integrations';
import type { Context } from './context';
import { settings } from './context';
import { brasiliaDay, prayerForDay } from './daily-prayers';
import { defaultReviewSettings } from '@maos-em-oracao/contracts';
import { Notifications, type EmailEnvelope } from './notifications';
import { PaymentsService } from './payments';
import { SubscriptionsService } from './subscriptions';
import { ContentService } from './content';
import { ShippingService } from './shipping';
import { MediaService } from './media';
import { ReportsService } from './reports';
import { GroupBuysService } from './group-buys';
import { unseal, recipientHash, normalizeEmail } from './security';
import { data, requireValue, DomainError, audit } from './shared';
import { classifyEmailEvent, resendTag } from '@maos-em-oracao/emails/resend';
export interface WorkItem {
  source: 'outbox' | 'webhook';
  id: string;
}
export function queueConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
const terminal = new Set([
  'completed',
  'accepted',
  'sent',
  'delivered',
  'delayed',
  'bounced',
  'complained',
  'suppressed',
  'cancelled',
  'blocked',
  'unknown',
  'failed',
]);
export class WorkerEngine {
  readonly queues: Record<string, Queue>;
  readonly workers: Worker[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private dispatching = false;
  private ticking = false;
  constructor(private ctx: Context) {
    const connection = queueConnection(ctx.config.REDIS_URL);
    this.queues = Object.fromEntries(
      ['email', 'operations', 'models', 'exports'].map((name) => [
        name,
        new Queue(ctx.config.QUEUE_PREFIX + '-' + name, {
          connection,
          defaultJobOptions: {
            attempts: 8,
            backoff: { type: 'exponential', delay: 1000, jitter: 0.2 },
            removeOnComplete: { age: 7 * 86400, count: 10000 },
            removeOnFail: { age: 30 * 86400, count: 10000 },
          },
        }),
      ]),
    );
  }
  async start() {
    for (const name of Object.keys(this.queues)) {
      const worker = new Worker<WorkItem>(
        this.ctx.config.QUEUE_PREFIX + '-' + name,
        (job) => this.process(job.data),
        {
          connection: queueConnection(this.ctx.config.REDIS_URL),
          concurrency: name === 'models' || name === 'exports' ? 1 : 4,
          lockDuration: 60000,
          limiter:
            name === 'email'
              ? { max: 1, duration: 1000 }
              : name === 'operations'
                ? { max: 4, duration: 1000 }
                : undefined,
        },
      );
      worker.on('error', () => {});
      worker.on('failed', async (job, error) => {
        if (!job) return;
        if (error instanceof UnrecoverableError || job.attemptsMade >= 8) {
          if (job.data.source === 'outbox')
            await this.ctx.db.outboxEvent
              .updateMany({
                where: { id: job.data.id, state: { notIn: [...terminal] } },
                data: { state: 'failed', errorCode: 'JOB_EXHAUSTED' },
              })
              .catch(() => {});
          else
            await this.ctx.db.webhookInbox
              .updateMany({
                where: { id: job.data.id, state: 'pending' },
                data: { state: 'failed', errorCode: 'JOB_EXHAUSTED' },
              })
              .catch(() => {});
        }
      });
      this.workers.push(worker);
    }
    await this.dispatch();
    this.timers.push(
      setInterval(() => {
        void this.dispatch().catch(() => {});
      }, 2000),
    );
    this.timers.push(
      setInterval(() => {
        void this.tick().catch(() => {});
      }, 30000),
    );
    void this.tick().catch(() => {});
  }
  private queueFor(kind: string) {
    return kind === 'email'
      ? 'email'
      : kind === 'model-convert'
        ? 'models'
        : kind === 'report-export'
          ? 'exports'
          : 'operations';
  }
  async dispatch() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const now = new Date(),
        stale = new Date(Date.now() - 120000),
        rows = await this.ctx.db.outboxEvent.findMany({
          where: {
            OR: [
              { state: 'pending', availableAt: { lte: now } },
              { state: 'enqueued', updatedAt: { lt: stale } },
              { state: 'processing', availableAt: { lt: now } },
            ],
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });
      for (const row of rows) {
        const queue = this.queues[this.queueFor(row.kind)],
          jobId = 'outbox-' + row.id,
          old = await queue.getJob(jobId);
        if (old && ['completed', 'failed'].includes(await old.getState())) {
          if (row.state !== 'processing') await old.remove();
        }
        await queue.add(row.kind, { source: 'outbox', id: row.id }, { jobId });
        await this.ctx.db.outboxEvent.updateMany({
          where: { id: row.id, state: 'pending' },
          data: { state: 'enqueued' },
        });
      }
      const inbox = await this.ctx.db.webhookInbox.findMany({
        where: { state: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      for (const row of inbox)
        await this.queues.operations.add(
          'webhook',
          { source: 'webhook', id: row.id },
          { jobId: 'webhook-' + row.id },
        );
    } finally {
      this.dispatching = false;
    }
  }
  async process(work: WorkItem) {
    if (work.source === 'webhook') return this.webhook(work.id);
    const row = requireValue(await this.ctx.db.outboxEvent.findUnique({ where: { id: work.id } }));
    if (terminal.has(row.state)) return;
    const claimed = await this.ctx.db.outboxEvent.updateMany({
      where: {
        id: row.id,
        OR: [
          { state: { in: ['pending', 'enqueued'] } },
          { state: 'processing', availableAt: { lt: new Date() } },
        ],
      },
      data: {
        state: 'processing',
        availableAt: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
        firstAttemptAt: row.firstAttemptAt || new Date(),
      },
    });
    if (!claimed.count) throw new Error('WORK_LEASE_BUSY');
    try {
      if (row.attempts >= 8)
        throw new DomainError('JOB_EXHAUSTED', 'A operação precisa de revisão administrativa.');
      const payload = unseal<Record<string, unknown>>(row.payloadEncrypted, this.ctx.config);
      switch (row.kind) {
        case 'email':
          await this.email(row.id, payload as unknown as EmailEnvelope, row);
          return;
        case 'model-convert':
          await new MediaService(this.ctx).processModel(String(payload.assetId));
          break;
        case 'shipping-label':
          try {
            await new ShippingService(this.ctx).generate(String(payload.shipmentId));
          } catch (error) {
            // Purchase failures (no balance, expired quote, disconnected account) need a person.
            if (
              error instanceof DomainError ||
              (error instanceof ProviderError && !error.unknown)
            ) {
              const s = await this.ctx.db.shipment.findUnique({
                where: { id: String(payload.shipmentId) },
                include: { order: true },
              });
              if (s)
                await new ShippingService(this.ctx).alertFailure(s.orderId, s.order.number, error);
            }
            throw error;
          }
          break;
        case 'shipping-auto':
          await new ShippingService(this.ctx).automate(String(payload.orderId));
          break;
        case 'shipping-cancel':
          await new ShippingService(this.ctx).cancel(String(payload.shipmentId));
          break;
        case 'refund-order':
          await new PaymentsService(this.ctx).refund(
            String(payload.orderId),
            String(payload.reason),
          );
          break;
        case 'payment-create-pix':
          await new PaymentsService(this.ctx).start(String(payload.orderId));
          break;
        case 'payment-cancel':
          await new PaymentsService(this.ctx).cancelPending(
            String(payload.intentId),
            typeof payload.expectedDue === 'string' ? payload.expectedDue : undefined,
          );
          break;
        case 'payment-reconcile':
          await this.reconcilePayment(String(payload.partId));
          break;
        case 'campaign':
          await new ContentService(this.ctx).fanoutCampaign(String(payload.campaignId));
          break;
        case 'report-export':
          await new ReportsService(this.ctx).generate(String(payload.exportId));
          break;
        case 'refund-orphan':
          await this.refundOrphan(String(payload.exceptionId));
          break;
        case 'group-buy-reached':
          await new GroupBuysService(this.ctx).reached(String(payload.groupBuyId));
          break;
        case 'group-buy-refund':
          await new GroupBuysService(this.ctx).refundDifference(String(payload.orderId));
          break;
        case 'group-buy-fail-order':
          await new GroupBuysService(this.ctx).failOrder(String(payload.orderId));
          break;
        default:
          throw new DomainError('UNKNOWN_JOB', 'Tipo de operação não reconhecido.');
      }
      await this.ctx.db.outboxEvent.update({
        where: { id: row.id },
        data: { state: 'completed', errorCode: null },
      });
    } catch (error) {
      const permanent =
        error instanceof DomainError ||
        (error instanceof ProviderError && !error.unknown && error.status !== 429);
      const code =
        error instanceof DomainError || error instanceof ProviderError
          ? error.code
          : 'TRANSIENT_ERROR';
      await this.ctx.db.outboxEvent.updateMany({
        where: { id: row.id, state: 'processing' },
        data: {
          state: permanent ? 'failed' : 'enqueued',
          errorCode: code,
          availableAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** row.attempts)),
        },
      });
      if (row.kind === 'report-export' && permanent)
        await this.ctx.db.reportExport.updateMany({
          where: { id: row.aggregateId },
          data: { state: 'failed' },
        });
      if (permanent) throw new UnrecoverableError(code);
      throw new Error(code);
    }
  }
  private async email(
    id: string,
    envelope: EmailEnvelope,
    row: Awaited<ReturnType<Context['db']['outboxEvent']['findUniqueOrThrow']>>,
  ) {
    const c = this.ctx.config,
      recipient = normalizeEmail(envelope.to),
      suppression = await this.ctx.db.emailSuppression.findUnique({
        where: { emailHash: recipientHash(recipient, c) },
      });
    if (suppression) {
      await this.ctx.db.outboxEvent.update({
        where: { id },
        data: { state: 'suppressed', errorCode: suppression.reason },
      });
      return;
    }
    const ttl: Record<string, number> = {
      'password-reset': 1800000,
      'verify-email': 86400000,
      'team-invite': 3 * 86400000,
      'devotional-opt-in': 86400000,
    };
    if (ttl[envelope.kind] && Date.now() - row.createdAt.getTime() > ttl[envelope.kind]) {
      await this.ctx.db.outboxEvent.update({
        where: { id },
        data: { state: 'cancelled', errorCode: 'LINK_EXPIRED' },
      });
      return;
    }
    if (envelope.category === 'devotional') {
      const subscriber = envelope.subscriberId
          ? await this.ctx.db.devotionalSubscriber.findUnique({
              where: { id: envelope.subscriberId },
            })
          : null,
        campaign = envelope.campaignId
          ? await this.ctx.db.campaign.findUnique({ where: { id: envelope.campaignId } })
          : null;
      if (
        !subscriber?.verifiedAt ||
        subscriber.unsubscribedAt ||
        subscriber.tokenVersion !== envelope.subscriberVersion ||
        normalizeEmail(subscriber.email) !== recipient ||
        campaign?.state === 'Cancelada'
      ) {
        await this.ctx.db.outboxEvent.update({
          where: { id },
          data: { state: 'cancelled', errorCode: 'CONSENT_REVOKED' },
        });
        return;
      }
    }
    if (
      row.firstAttemptAt &&
      row.attempts > 0 &&
      Date.now() - row.firstAttemptAt.getTime() >= 23 * 3600000
    ) {
      await this.ctx.db.outboxEvent.update({
        where: { id },
        data: { state: 'unknown', errorCode: 'IDEMPOTENCY_WINDOW_EXCEEDED' },
      });
      return;
    }
    let providerId: string;
    if (c.INTEGRATIONS_MODE === 'mock') {
      const file = new MediaService(this.ctx).path('emails/' + id + '.html');
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, envelope.html, { mode: 0o600 });
      await writeFile(file.replace(/\.html$/, '.txt'), envelope.text, { mode: 0o600 });
      providerId = 'mock-email-' + id;
    } else {
      if (c.EMAIL_ENABLED !== 'true' || !c.RESEND_API_KEY) {
        await this.ctx.db.outboxEvent.update({
          where: { id },
          data: { state: 'blocked', errorCode: 'EMAIL_DISABLED' },
        });
        return;
      }
      const result = await new Resend(c.RESEND_API_KEY).emails.send(
        {
          from: envelope.from,
          to: [recipient],
          replyTo: envelope.replyTo,
          subject: envelope.subject,
          html: envelope.html,
          text: envelope.text,
          headers: envelope.headers,
          tags: [
            resendTag('template', envelope.kind),
            resendTag('version', envelope.version),
            resendTag('outbox', id),
          ],
        },
        { idempotencyKey: envelope.idempotencyKey },
      );
      if (result.error)
        throw new ProviderError(
          'Resend',
          `HTTP_${result.error.statusCode || 503}`,
          result.error.statusCode === 429 ? 429 : 503,
          result.error.statusCode === null || (result.error.statusCode || 0) >= 500,
        );
      providerId = requireValue(result.data?.id, 'O provedor não retornou um identificador.');
    }
    await transaction(this.ctx.db, async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: { id, state: 'processing' },
        data: { state: 'accepted', providerId, acceptedAt: new Date(), errorCode: null },
      });
      if (updated.count && envelope.campaignId)
        await tx.campaign.update({
          where: { id: envelope.campaignId },
          data: { recipients: { increment: 1 } },
        });
    });
    await this.reconcileDelivery(providerId);
  }
  private async reconcileDelivery(providerId: string) {
    await transaction(this.ctx.db, async (tx) => {
      const outbox = await tx.outboxEvent.findUnique({ where: { providerId } });
      if (!outbox) return;
      const events = await tx.emailDeliveryEvent.findMany({ where: { providerId } });
      const effective = [
        'email.complained',
        'email.bounced',
        'email.suppressed',
        'email.delivered',
        'email.failed',
        'email.delivery_delayed',
        'email.sent',
      ].find((type) => events.some((e) => e.type === type));
      if (!effective) return;
      const classified = classifyEmailEvent(effective);
      if (classified)
        await tx.outboxEvent.update({
          where: { id: outbox.id },
          data: { state: classified.state },
        });
      if (events.some((e) => classifyEmailEvent(e.type)?.suppress)) {
        const envelope = unseal<EmailEnvelope>(outbox.payloadEncrypted, this.ctx.config),
          emailHash = recipientHash(normalizeEmail(envelope.to), this.ctx.config);
        await tx.emailSuppression.upsert({
          where: { emailHash },
          create: { emailHash, reason: classified?.state || 'suppressed' },
          update: {},
        });
      }
    });
  }
  async webhook(id: string) {
    const inbox = requireValue(await this.ctx.db.webhookInbox.findUnique({ where: { id } }));
    if (inbox.state !== 'pending') return;
    const payload = unseal<Record<string, unknown>>(inbox.payloadEncrypted, this.ctx.config);
    try {
      if (inbox.provider === 'mercado-pago') {
        const resource = String(payload.resourceId);
        if (payload.type === 'payment') {
          if (this.ctx.config.INTEGRATIONS_MODE === 'mock') {
            await this.ctx.db.webhookInbox.update({ where: { id }, data: { state: 'completed' } });
            return;
          }
          const p = await this.ctx.payments.get(resource);
          const part = await this.ctx.db.paymentPart.findFirst({
            where: { OR: [{ providerId: p.id }, { id: p.reference }] },
          });
          if (part) await new PaymentsService(this.ctx).apply(p);
        } else if (payload.type === 'subscription_authorized_payment')
          await new SubscriptionsService(this.ctx).recurringPayment(resource);
        else if (payload.type === 'subscription_preapproval') {
          const result = await this.ctx.payments.subscription(resource),
            sub = await this.ctx.db.subscription.findFirst({
              where: {
                OR: [
                  { providerId: result.id },
                  ...(result.external_reference
                    ? [
                        {
                          id: result.external_reference,
                          providerId: null,
                          providerState: { in: ['authorizing', 'authorization_unknown'] },
                        },
                      ]
                    : []),
                ],
              },
            });
          if (sub) {
            const paid = await this.ctx.db.order.findFirst({
              where: { subscriptionId: sub.id, payment: { status: 'Pago' } },
            });
            await this.ctx.db.subscription.update({
              where: { id: sub.id },
              data: {
                providerId: result.id,
                ...(result.next_payment_date &&
                Number.isFinite(Date.parse(result.next_payment_date))
                  ? { nextRenewal: new Date(result.next_payment_date) }
                  : {}),
                providerState: result.status,
                status:
                  result.status === 'cancelled'
                    ? 'Cancelada'
                    : result.status === 'paused'
                      ? 'Pausada'
                      : paid
                        ? 'Ativa'
                        : 'Pagamento pendente',
              },
            });
          }
        }
      } else if (inbox.provider === 'melhor-envio') {
        const shipment = await this.ctx.db.shipment.findUnique({
          where: { providerId: String(payload.providerId) },
        });
        if (shipment) await new ShippingService(this.ctx).reconcile(shipment.id);
      } else if (inbox.provider === 'bunny-stream') {
        const asset = await this.ctx.db.mediaAsset.findUnique({
          where: { providerId: String(payload.VideoGuid) },
        });
        if (asset) await new MediaService(this.ctx).refreshVideo(asset.id);
      } else if (inbox.provider === 'resend') {
        const body = data<{ type: string; created_at: string; data: { email_id: string } }>(
            payload,
          ),
          classified = classifyEmailEvent(body.type);
        if (classified) {
          await transaction(this.ctx.db, async (tx) => {
            await tx.emailDeliveryEvent.upsert({
              where: { inboxKey: inbox.id },
              create: {
                inboxKey: inbox.id,
                providerId: body.data.email_id,
                type: body.type,
                occurredAt: new Date(body.created_at),
              },
              update: {},
            });
            const outbox = await tx.outboxEvent.findUnique({
              where: { providerId: body.data.email_id },
            });
            if (outbox) {
              const all = await tx.emailDeliveryEvent.findMany({
                  where: { providerId: body.data.email_id },
                }),
                types = all.map((e) => e.type);
              const precedence = [
                  'email.complained',
                  'email.bounced',
                  'email.suppressed',
                  'email.delivered',
                  'email.failed',
                  'email.delivery_delayed',
                  'email.sent',
                ],
                effective = precedence.find((t) => types.includes(t));
              await tx.outboxEvent.update({
                where: { id: outbox.id },
                data: {
                  state: classifyEmailEvent(effective || body.type)?.state || classified.state,
                },
              });
              if (classified.suppress) {
                const envelope = unseal<EmailEnvelope>(outbox.payloadEncrypted, this.ctx.config),
                  emailHash = recipientHash(normalizeEmail(envelope.to), this.ctx.config);
                await tx.emailSuppression.upsert({
                  where: { emailHash },
                  create: { emailHash, reason: classified.state },
                  update: { reason: classified.state },
                });
              }
            }
          });
        }
      }
      await this.ctx.db.webhookInbox.update({
        where: { id },
        data: { state: 'completed', errorCode: null },
      });
    } catch (error) {
      if (error instanceof DomainError) {
        await this.ctx.db.webhookInbox.update({
          where: { id },
          data: { state: 'failed', errorCode: error.code },
        });
        throw new UnrecoverableError(error.code);
      }
      throw new Error(error instanceof ProviderError ? error.code : 'WEBHOOK_RETRY');
    }
  }
  async reconcilePayment(partId: string) {
    const p = requireValue(await this.ctx.db.paymentPart.findUnique({ where: { id: partId } }));
    if (this.ctx.config.INTEGRATIONS_MODE === 'mock') return;
    if (p.providerId)
      await new PaymentsService(this.ctx).apply(await this.ctx.payments.get(p.providerId));
    else
      for (const result of await this.ctx.payments.search(p.id))
        await new PaymentsService(this.ctx).apply(result);
  }
  private async refundOrphan(id: string) {
    const p = requireValue(await this.ctx.db.paymentException.findUnique({ where: { id } }));
    if (p.state === 'refunded') return;
    const r = await this.ctx.payments.refund(p.providerId, p.amountCents, 'exception-' + p.id);
    if (r.status && r.status !== 'approved') throw new Error('REFUND_NOT_CONFIRMED');
    await transaction(this.ctx.db, async (tx) => {
      await tx.paymentException.update({
        where: { id },
        data: { state: 'refunded', refundId: String(r.id) },
      });
      await tx.ledgerEntry.upsert({
        where: { eventKey: 'exception-refund/' + p.id },
        create: {
          eventKey: 'exception-refund/' + p.id,
          kind: 'refund',
          amountCents: -p.amountCents,
        },
        update: {},
      });
    });
  }
  /**
   * Once per Brasília day, at the configured hour, schedule the automatic daily prayer for
   * confirmed subscribers. A campaign already scheduled (or cancelled) for that day by the
   * team takes precedence, and the per-day lock keeps concurrent workers from duplicating.
   */
  async scheduleDailyPrayer(now = new Date()) {
    const { workspace } = await settings(this.ctx.db);
    if (workspace.dailyPrayerAuto === false) return null;
    // "Horário preferido (Brasília)" from Configurações, e.g. "06:00".
    const current = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    if (
      current <
      (/^\d{2}:\d{2}$/.test(workspace.prayerSendHour) ? workspace.prayerSendHour : '06:00')
    )
      return null;
    if (
      !(await this.ctx.db.devotionalSubscriber.count({
        where: { verifiedAt: { not: null }, unsubscribedAt: null },
      }))
    )
      return null;
    const day = brasiliaDay(now),
      start = new Date(day + 'T00:00:00-03:00'),
      end = new Date(day + 'T23:59:59.999-03:00');
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'daily-prayer/' + day);
      if (
        await tx.campaign.findFirst({
          where: { audience: 'Inscritos em oração', scheduledAt: { gte: start, lte: end } },
          select: { id: true },
        })
      )
        return null;
      const p = prayerForDay(day);
      const c = await tx.campaign.create({
        data: {
          subject: p.title,
          message: p.prayer,
          previewText: p.reflection,
          audience: 'Inscritos em oração',
          state: 'Agendada',
          scheduledAt: now,
        },
      });
      await audit(tx, 'system', 'Oração diária automática agendada', c.id);
      return c.id;
    });
  }
  /**
   * Asks delivered-order customers how the pieces turned out, once per order, after the
   * configured delay. Orders delivered more than 60 days ago are never requested, customers
   * who opted out are skipped, and orders whose items were all reviewed already get no e-mail.
   */
  async scheduleReviewRequests(now = new Date()) {
    const config = (await settings(this.ctx.db)).workspace.reviews ?? defaultReviewSettings;
    if (config.requestEnabled === false) return 0;
    const mail = new Notifications(this.ctx),
      day = 86400000,
      orders = await this.ctx.db.order.findMany({
        where: {
          status: 'Entregue',
          reviewRequestedAt: null,
          deliveredAt: {
            lte: new Date(now.getTime() - config.requestDelayDays * day),
            gte: new Date(now.getTime() - 60 * day),
          },
          customer: { reviewRequestsOptOut: false },
        },
        orderBy: { deliveredAt: 'asc' },
        select: { id: true },
        take: 50,
      });
    let sent = 0;
    for (const { id } of orders)
      try {
        // Claiming first (own transaction) keeps "once per order" and stops an order that
        // fails to render from being retried, and from starving newer ones, every tick.
        const claimed = await transaction(this.ctx.db, async (tx) => {
          const won = await tx.order.updateMany({
            where: { id, reviewRequestedAt: null },
            data: { reviewRequestedAt: now },
          });
          if (!won.count) return false;
          const { customer } = await tx.order.findUniqueOrThrow({
            where: { id },
            select: { customer: { select: { email: true } } },
          });
          // Guest checkouts make a Customer row per order: the opt-out is per e-mail.
          return !(await tx.customer.count({
            where: {
              email: { equals: customer.email, mode: 'insensitive' },
              reviewRequestsOptOut: true,
            },
          }));
        });
        if (!claimed) continue;
        sent += await transaction(this.ctx.db, async (tx) => {
          const order = await tx.order.findUniqueOrThrow({
            where: { id },
            include: { customer: true, items: { include: { review: { select: { id: true } } } } },
          });
          const pending = order.items.filter((item) => !item.review);
          if (!pending.length) return 0;
          await mail.email(tx, 'review-request/' + id, id, order.customer.email, {
            kind: 'review-request',
            name: order.customer.name,
            orderNumber: 'MEO-' + String(order.number).padStart(6, '0'),
            items: pending.map((item) => {
              const d = data<{ name?: string; size?: string; color?: string }>(item.data);
              return {
                name: d.name || 'Peça',
                variant: [d.size, d.color].filter(Boolean).join(' · '),
              };
            }),
            actionUrl: await mail.orderUrl(tx, id, 30),
            optOutUrl: mail.reviewOptOutUrl(order.customerId),
          });
          return 1;
        });
      } catch (error) {
        console.error(
          'Pedido de avaliação falhou:',
          id,
          (error as { code?: string } | null)?.code ?? (error as Error | null)?.name ?? 'erro',
        );
      }
    return sent;
  }
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = new Date(),
        mail = new Notifications(this.ctx);
      await this.scheduleDailyPrayer(now).catch(() => null);
      await this.scheduleReviewRequests(now).catch(() => 0);
      const campaigns = await this.ctx.db.campaign.findMany({
        where: { state: 'Agendada', scheduledAt: { lte: now } },
        take: 20,
      });
      for (const c of campaigns)
        await transaction(this.ctx.db, (tx) =>
          mail.event(tx, 'campaign/' + c.id, 'campaign', c.id, { campaignId: c.id }),
        );
      const final = await this.ctx.db.campaign.findMany({
        where: { state: 'Processando' },
        take: 20,
      });
      for (const c of final) {
        const pending = await this.ctx.db.outboxEvent.count({
          where: { aggregateId: c.id, state: { in: ['pending', 'enqueued', 'processing'] } },
        });
        if (!pending) {
          const failed = await this.ctx.db.outboxEvent.count({
            where: { aggregateId: c.id, state: { in: ['failed', 'blocked', 'unknown'] } },
          });
          await this.ctx.db.campaign.update({
            where: { id: c.id },
            data: { state: failed ? 'Parcial' : 'Enviada' },
          });
        }
      }
      const expired = await this.ctx.db.paymentIntent.findMany({
        where: { status: 'Pendente', due: { lte: now } },
        orderBy: { due: 'asc' },
        take: 100,
      });
      for (const payment of expired)
        await transaction(this.ctx.db, (tx) =>
          mail.event(
            tx,
            'payment-expire/' + payment.id + '/' + payment.due.getTime(),
            'payment-cancel',
            payment.orderId,
            { intentId: payment.id, expectedDue: payment.due.toISOString() },
          ),
        );
      const payments = await this.ctx.db.paymentPart.findMany({
        where: {
          status: { in: ['pending', 'creating', 'unknown'] },
          updatedAt: { lt: new Date(Date.now() - 60000) },
        },
        orderBy: { updatedAt: 'asc' },
        take: 50,
      });
      for (const p of payments)
        try {
          await this.reconcilePayment(p.id);
        } catch {
        } finally {
          await this.ctx.db.paymentPart.update({
            where: { id: p.id },
            data: { updatedAt: new Date() },
          });
        }
      const tracking = await this.ctx.db.shipment.findMany({
        where: { providerId: { not: null }, state: { in: ['ready', 'posted'] } },
        orderBy: { updatedAt: 'asc' },
        take: 50,
      });
      for (const s of tracking)
        try {
          await new ShippingService(this.ctx).reconcile(s.id);
        } catch {
        } finally {
          await this.ctx.db.shipment.update({
            where: { id: s.id },
            data: { updatedAt: new Date() },
          });
        }
      const videos = await this.ctx.db.mediaAsset.findMany({
        where: { storage: 'bunny-stream', state: 'processing' },
        take: 20,
      });
      for (const v of videos)
        try {
          await new MediaService(this.ctx).refreshVideo(v.id);
        } catch {}
      if (this.ctx.config.INTEGRATIONS_MODE === 'live') {
        const subs = await this.ctx.db.subscription.findMany({
          where: { payment: 'card', providerId: { not: null }, status: { not: 'Cancelada' } },
          orderBy: { updatedAt: 'asc' },
          take: 50,
        });
        for (const s of subs)
          try {
            for (const invoice of await this.ctx.payments.invoices(s.providerId!))
              await new SubscriptionsService(this.ctx).recurringPayment(invoice);
          } catch {
          } finally {
            await this.ctx.db.subscription.update({
              where: { id: s.id },
              data: { updatedAt: new Date() },
            });
          }
      }
      await new SubscriptionsService(this.ctx).tick();
      await mail.lowStock();
      await this.ctx.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } finally {
      this.ticking = false;
    }
  }
  async close() {
    this.timers.forEach(clearInterval);
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled(Object.values(this.queues).map((q) => q.close()));
  }
}

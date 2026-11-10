import { Resend } from 'resend';
import { renderEmail, type EmailMessage } from '@maos-em-oracao/emails';
import { emailIdempotencyKey } from '@maos-em-oracao/emails/resend';
import { z } from 'zod';
import { settings } from './context';
import type { Permission } from '@maos-em-oracao/contracts';
import type { Transaction } from '@maos-em-oracao/database';
import type { Context } from './context';
import { normalizeEmail, seal, recipientHash, signedToken, token, digest } from './security';
import { json } from './shared';
export interface EmailEnvelope {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  kind: string;
  version: string;
  category: string;
  subscriberId?: string;
  subscriberVersion?: number;
  campaignId?: string;
  adminToken?: string;
}
export class Notifications {
  async orderUrl(tx: Transaction, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { customer: true },
    });
    if (order.customer.userId) return this.ctx.config.PUBLIC_WEB_URL + '/conta/pedidos/' + order.id;
    const raw = token();
    await tx.emailToken.create({
      data: {
        tokenHash: digest(raw),
        purpose: 'guest-order',
        data: { orderId: order.id },
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return this.ctx.config.PUBLIC_WEB_URL + '/pedido/acesso?token=' + raw;
  }
  constructor(private ctx: Context) {}
  async operation(
    tx: Transaction,
    key: string,
    aggregateId: string,
    permission: Permission,
    title: string,
    summary: string,
    path: string,
    additional: string[] = [],
  ) {
    const users = await tx.user.findMany({
      where: {
        enabled: true,
        role: { not: 'customer' },
        OR: [{ owner: true }, { permissions: { has: permission } }],
      },
      select: { name: true, email: true },
    });
    const recipients = new Map(users.map((u) => [normalizeEmail(u.email), u.name]));
    for (const email of additional)
      if (z.email().safeParse(email).success) recipients.set(normalizeEmail(email), 'Equipe');
    for (const [email, name] of recipients)
      await this.email(tx, 'operation/' + key, aggregateId, email, {
        kind: 'operation-alert',
        name,
        title,
        summary,
        actionUrl: this.ctx.config.PUBLIC_WEB_URL + path,
      });
  }
  async lowStock() {
    const config = await settings(this.ctx.db);
    if (!config.workspace.notificationLowStock || config.workspace.inventoryPolicy !== 'stock')
      return;
    const products = await this.ctx.db.$queryRaw<
      { id: string; name: string; stock: number; reserved: number }[]
    >`SELECT id,name,stock,reserved FROM "Product" WHERE active=true AND archived=false AND stock-reserved<=${config.store.lowStock} ORDER BY id LIMIT 1000`;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    for (const product of products)
      await this.ctx.db.$transaction((tx) =>
        this.operation(
          tx,
          'low-stock/' + product.id + '/' + day,
          product.id,
          'catalog',
          'Uma peça precisa de reposição.',
          product.name + ': ' + (product.stock - product.reserved) + ' unidades disponíveis.',
          '/admin/produtos',
          config.workspace.lowStockEmails.split(/[;,\s]+/).filter(Boolean),
        ),
      );
  }
  async email(
    tx: Transaction,
    key: string,
    aggregateId: string,
    to: string,
    message: EmailMessage,
    metadata: Pick<
      EmailEnvelope,
      'subscriberId' | 'subscriberVersion' | 'campaignId' | 'adminToken'
    > = {},
  ) {
    const c = this.ctx.config;
    const recipient = normalizeEmail(to),
      eventKey = 'email/' + key + '/' + recipientHash(recipient, c);
    const existing = await tx.outboxEvent.findUnique({ where: { key: eventKey } });
    if (existing) return existing;
    const devotional = ['daily-prayer', 'devotional-opt-in'].includes(message.kind)
      ? (await settings(tx)).workspace
      : null;
    const replyTo = devotional?.prayerReplyTo || c.EMAIL_REPLY_TO;
    const senderName = (devotional?.prayerSenderName || 'Mãos em Oração')
      .replace(/[\r\n<>"]/g, '')
      .slice(0, 120);
    const rendered = renderEmail(message, {
      webUrl: c.PUBLIC_WEB_URL,
      supportEmail: replyTo,
      // loadConfig only accepts an http PUBLIC_WEB_URL on loopback outside production, so
      // this also covers local live homologation (SHIPPING_SIMULATED) without weakening prod.
      allowLocalHttp: c.NODE_ENV !== 'production',
    });
    const envelope: EmailEnvelope = {
      to: recipient,
      from: `${senderName} <${c.EMAIL_FROM}>`,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      idempotencyKey: emailIdempotencyKey(key, recipient, rendered),
      kind: rendered.kind,
      version: rendered.version,
      category: rendered.category,
      ...metadata,
    };
    return tx.outboxEvent.upsert({
      where: { key: 'email/' + key + '/' + recipientHash(recipient, c) },
      create: {
        key: 'email/' + key + '/' + recipientHash(recipient, c),
        kind: 'email',
        aggregateId,
        payloadEncrypted: seal(envelope, c),
      },
      update: {},
    });
  }
  async event(tx: Transaction, key: string, kind: string, aggregateId: string, payload: unknown) {
    return tx.outboxEvent.upsert({
      where: { key },
      create: { key, kind, aggregateId, payloadEncrypted: seal(payload, this.ctx.config) },
      update: {},
    });
  }
  unsubscribeLinks(id: string, version: number) {
    const t = signedToken(
        { purpose: 'unsubscribe', id, version, expiresAt: Date.now() + 366 * 86400000 },
        this.ctx.config,
      ),
      base = this.ctx.config.PUBLIC_WEB_URL;
    return {
      unsubscribeUrl: base + '/oracao/descadastro?token=' + encodeURIComponent(t),
      oneClickUnsubscribeUrl: base + '/api/email/unsubscribe?token=' + encodeURIComponent(t),
    };
  }
  verifyResend(raw: string, headers: { id: string; timestamp: string; signature: string }) {
    const secret = this.ctx.config.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new Error('RESEND_WEBHOOK_SECRET ausente.');
    return new Resend('re_verification-only-no-network').webhooks.verify({
      payload: raw,
      headers,
      webhookSecret: secret,
    });
  }
  async inbox(provider: string, eventId: string, type: string, payload: unknown) {
    return this.ctx.db.webhookInbox.upsert({
      where: { provider_eventId: { provider, eventId } },
      create: { provider, eventId, type, payloadEncrypted: seal(json(payload), this.ctx.config) },
      update: {},
    });
  }
}

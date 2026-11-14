import { z } from 'zod';
import {
  Prisma,
  transaction,
  lock,
  type PrismaClient,
  type Transaction,
} from '@maos-em-oracao/database';
import {
  CRM_LIMITS,
  MARKETING_CONSENT_TEXT,
  MARKETING_CONSENT_VERSION,
  canReceiveMarketing,
  contactImportSchema,
  crmSettingsSchema,
  defaultCrmSettings,
  normalizeTag,
  segmentSchema,
  tagSchema,
  type AdminCrm,
  type ConsentSource,
  type CrmSettings,
  type LegalBasis,
  type MarketingContactRow,
  type MarketingStatus,
  type Segment,
  type SegmentRule,
} from '@maos-em-oracao/contracts';
import type { Context } from './context';
import { normalizeEmail, readSignedToken, recipientHash, signedToken } from './security';
import {
  type Actor,
  DomainError,
  audit,
  data,
  json,
  permit,
  requireActor,
  requireValue,
} from './shared';

type Db = PrismaClient | Transaction;
type ContactRow = Prisma.MarketingContactGetPayload<object>;
/** One audience line per normalized e-mail; `contactId` is null for a buyer without contact. */
export interface AudienceRow {
  contactId: string | null;
  email: string;
  name: string;
  basis: LegalBasis;
}

/** Admin input for a contact: tags only, never legal basis, consent or unsubscribe. */
export const contactInputSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().max(100).optional(),
  tags: z.array(tagSchema).max(CRM_LIMITS.tags),
});

const IMPORT_BATCH = 500,
  CONTACTS_PAGE = 50,
  AUDIENCE_PAGE = 1000,
  FIVE_YEARS = 5 * 365.25 * 86400000;
/** Paid orders only: the same "comprador" rule for legitimate interest and purchase rules. */
const purchases = Prisma.sql`
  SELECT o.id, o."totalCents", o."createdAt", o."groupBuyId",
    lower(trim(c.email)) AS email, c.name AS "customerName"
  FROM "Order" o JOIN "Customer" c ON c.id = o."customerId"
  WHERE o.status NOT IN ('Aguardando pagamento', 'Cancelado')`;
const uniqueTags = (tags: string[]) => [...new Set(tags.map(normalizeTag))];
const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** E-mail marketing contacts (LGPD consent and unsubscribe), import, tags and audience. */
export class CrmService {
  constructor(private ctx: Context) {}

  /** AppSetting `crm` over the defaults; a missing row means the defaults. */
  async settings(db: Db = this.ctx.db): Promise<CrmSettings> {
    const row = await db.appSetting.findUnique({ where: { key: 'crm' } });
    return { ...defaultCrmSettings, ...(row ? data<Partial<CrmSettings>>(row.data) : {}) };
  }

  async saveSettings(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = crmSettingsSchema.parse(value);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'crm-settings');
      const current = await this.settings(tx);
      if (input.legitimateInterest !== current.legitimateInterest && !a.owner)
        throw new DomainError('FORBIDDEN', 'Só o dono da loja pode mudar essa chave.', 403);
      await tx.appSetting.upsert({
        where: { key: 'crm' },
        create: { key: 'crm', data: json(input) },
        update: { data: json(input), version: { increment: 1 } },
      });
      await audit(tx, a.id, 'Configurações de e-mail marketing atualizadas', 'crm');
    });
  }

  /** A new explicit consent: the only path that clears an earlier unsubscribe. */
  async consent(tx: Transaction, input: { email: string; name: string; source: ConsentSource }) {
    const email = normalizeEmail(input.email),
      name = input.name.trim().slice(0, 100),
      fields = {
        legalBasis: 'consent',
        consentAt: new Date(),
        consentVersion: MARKETING_CONSENT_VERSION,
        consentSource: input.source,
        unsubscribedAt: null,
        unsubscribedCampaignId: null,
      };
    await tx.marketingContact.upsert({
      where: { email },
      create: { email, name, ...fields },
      update: fields,
    });
    if (name) await tx.marketingContact.updateMany({ where: { email, name: '' }, data: { name } });
  }

  async accountStatus(actor: Actor | null): Promise<MarketingStatus> {
    const { email } = await this.account(actor),
      [contact, settings] = await Promise.all([
        this.ctx.db.marketingContact.findUnique({ where: { email } }),
        this.settings(),
      ]);
    return {
      subscribed: await this.receives(this.ctx.db, email, contact, settings),
      text: MARKETING_CONSENT_TEXT,
      version: MARKETING_CONSENT_VERSION,
    };
  }

  async setAccount(actor: Actor | null, value: unknown): Promise<void> {
    const input = z.object({ subscribed: z.boolean() }).parse(value),
      { id, email, name } = await this.account(actor);
    await transaction(this.ctx.db, async (tx) => {
      if (input.subscribed) await this.consent(tx, { email, name, source: 'account' });
      else await this.markUnsubscribed(tx, email);
      await audit(
        tx,
        id,
        input.subscribed
          ? 'E-mail marketing aceito na conta'
          : 'E-mail marketing recusado na conta',
        id,
      );
    });
  }

  unsubscribeLinks(contactId: string, campaignId?: string) {
    const t = signedToken(
        {
          purpose: 'marketing-unsubscribe',
          id: contactId,
          version: 1,
          expiresAt: Date.now() + FIVE_YEARS,
        },
        this.ctx.config,
      ),
      query =
        '?token=' +
        encodeURIComponent(t) +
        (campaignId ? '&c=' + encodeURIComponent(campaignId) : ''),
      base = this.ctx.config.PUBLIC_WEB_URL;
    return {
      unsubscribeUrl: base + '/email/descadastro' + query,
      oneClickUnsubscribeUrl: base + '/api/email/marketing-unsubscribe' + query,
    };
  }

  /** Idempotent: the first unsubscribe keeps its date and campaign. */
  async unsubscribe(value: unknown): Promise<void> {
    const input = z
      .object({ token: z.string().min(20).max(2048), campaignId: z.string().max(64).optional() })
      .parse(value);
    let id: string;
    try {
      id = readSignedToken(input.token, 'marketing-unsubscribe', this.ctx.config).id;
    } catch {
      throw new DomainError('INVALID_TOKEN', 'Link de descadastro inválido ou expirado.');
    }
    await transaction(this.ctx.db, async (tx) => {
      const contact = await tx.marketingContact.findUnique({ where: { id } });
      if (!contact)
        throw new DomainError('INVALID_TOKEN', 'Link de descadastro inválido ou expirado.');
      if (contact.unsubscribedAt) return;
      const campaign = input.campaignId
        ? await tx.marketingCampaign.findUnique({
            where: { id: input.campaignId },
            select: { id: true },
          })
        : null;
      await tx.marketingContact.updateMany({
        where: { id, unsubscribedAt: null },
        data: { unsubscribedAt: new Date(), unsubscribedCampaignId: campaign?.id ?? null },
      });
      await audit(tx, 'subscriber', 'Descadastro de e-mail marketing', id);
    });
  }

  async saveContact(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = contactInputSchema.parse(value),
      email = normalizeEmail(input.email),
      tags = uniqueTags(input.tags);
    await transaction(this.ctx.db, async (tx) => {
      const saved = await tx.marketingContact.upsert({
        where: { email },
        create: { email, name: input.name ?? '', tags },
        update: { tags, ...(input.name !== undefined ? { name: input.name } : {}) },
      });
      await audit(tx, a.id, 'Contato de e-mail marketing salvo', saved.id);
    });
  }

  async adminUnsubscribe(actor: Actor | null, value: string): Promise<void> {
    const a = permit(actor, 'marketing'),
      email = normalizeEmail(z.email().max(254).parse(value));
    await transaction(this.ctx.db, async (tx) => {
      const id = await this.markUnsubscribed(tx, email);
      await audit(tx, a.id, 'Contato descadastrado pela equipe', id);
    });
  }

  /**
   * Declared-consent import, 500 rows per transaction. A new contact gets `imported-consent`;
   * an existing one only gets the tag (and the basis when it has none), never a re-subscribe.
   */
  async importContacts(actor: Actor | null, value: unknown) {
    const a = permit(actor, 'marketing'),
      input = contactImportSchema.parse(value),
      rows = [
        ...new Map(
          input.rows.map((r) => [
            normalizeEmail(r.email),
            { ...r, email: normalizeEmail(r.email) },
          ]),
        ).values(),
      ];
    const totals = { created: 0, updated: 0, keptUnsubscribed: 0 };
    for (let i = 0; i < rows.length; i += IMPORT_BATCH) {
      const batch = rows.slice(i, i + IMPORT_BATCH);
      const counts = await transaction(this.ctx.db, async (tx) => {
        await lock(tx, 'crm-import');
        const now = new Date(),
          imported = {
            legalBasis: 'imported-consent',
            consentAt: now,
            consentVersion: 'importação',
            consentSource: 'import',
          },
          existing = new Map(
            (
              await tx.marketingContact.findMany({
                where: { email: { in: batch.map((r) => r.email) } },
              })
            ).map((c) => [c.email, c]),
          ),
          result = { created: 0, updated: 0, keptUnsubscribed: 0 };
        const fresh = batch.filter((r) => !existing.has(r.email));
        if (fresh.length)
          result.created = (
            await tx.marketingContact.createMany({
              data: fresh.map((r) => ({
                email: r.email,
                name: r.name.trim(),
                tags: [input.tag],
                ...imported,
              })),
            })
          ).count;
        for (const row of batch) {
          const c = existing.get(row.email);
          if (!c) continue;
          const tags =
            c.tags.includes(input.tag) || c.tags.length >= CRM_LIMITS.tags
              ? c.tags
              : [...c.tags, input.tag];
          await tx.marketingContact.update({
            where: { id: c.id },
            data: {
              tags,
              ...(!c.name && row.name.trim() ? { name: row.name.trim() } : {}),
              ...(!c.legalBasis && !c.unsubscribedAt ? imported : {}),
            },
          });
          result.updated++;
          if (c.unsubscribedAt) result.keptUnsubscribed++;
        }
        return result;
      });
      totals.created += counts.created;
      totals.updated += counts.updated;
      totals.keptUnsubscribed += counts.keptUnsubscribed;
    }
    await audit(
      this.ctx.db,
      a.id,
      `Contatos importados (${totals.created} novos, ${totals.updated} atualizados)`,
      input.tag,
    );
    return totals;
  }

  /** 50 contacts per page by e-mail; `cursor` is the opaque `next` of the previous page. */
  async contacts(
    actor: Actor | null,
    query: unknown,
  ): Promise<{ items: MarketingContactRow[]; next?: string }> {
    permit(actor, 'marketing');
    const input = z
        .object({
          q: z.string().trim().max(100).optional(),
          tag: z.string().max(200).transform(normalizeTag).optional(),
          cursor: z.string().max(1400).optional(),
        })
        .parse(query ?? {}),
      after = input.cursor ? Buffer.from(input.cursor, 'base64url').toString('utf8') : undefined;
    const rows = await this.ctx.db.marketingContact.findMany({
      where: {
        AND: [
          input.q
            ? {
                OR: [
                  { email: { contains: input.q, mode: 'insensitive' } },
                  { name: { contains: input.q, mode: 'insensitive' } },
                ],
              }
            : {},
          input.tag ? { tags: { has: input.tag } } : {},
          after !== undefined ? { email: { gt: after } } : {},
        ],
      },
      orderBy: { email: 'asc' },
      take: CONTACTS_PAGE + 1,
    });
    const page = rows.slice(0, CONTACTS_PAGE),
      emails = page.map((c) => c.email),
      [settings, people, suppressed] = await Promise.all([
        this.settings(),
        this.people(this.ctx.db, emails),
        this.suppressed(this.ctx.db, emails),
      ]);
    return {
      items: page.map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        legalBasis: c.legalBasis as LegalBasis | null,
        consentAt: iso(c.consentAt),
        consentSource: c.consentSource as ConsentSource | null,
        unsubscribedAt: iso(c.unsubscribedAt),
        tags: c.tags,
        eligible:
          !suppressed.has(c.email) &&
          this.eligible(c, settings, people.get(c.email)?.buyer ?? false),
        isCustomer: people.has(c.email),
      })),
      ...(rows.length > CONTACTS_PAGE
        ? { next: Buffer.from(page.at(-1)!.email, 'utf8').toString('base64url') }
        : {}),
    };
  }

  /**
   * Rows `{ contactId, email, name, basis }`, one per normalized e-mail, ordered by e-mail.
   * Suppressed e-mails (EmailSuppression is an HMAC) are filtered by `audiencePage`.
   */
  audienceSql(segment: Segment, settings: Pick<CrmSettings, 'legitimateInterest'>): Prisma.Sql {
    const li = settings.legitimateInterest,
      rules = segment.rules.map((rule) => this.ruleSql(rule));
    return Prisma.sql`
      WITH purchases AS (${purchases}),
      base AS (
        SELECT mc.id AS "contactId", mc.email, mc.name, mc."legalBasis" AS basis, mc.tags
        FROM "MarketingContact" mc
        WHERE mc."unsubscribedAt" IS NULL AND (
          (mc."legalBasis" IN ('consent', 'imported-consent') AND mc."consentAt" IS NOT NULL)
          ${li ? Prisma.sql`OR mc."legalBasis" = 'legitimate-interest'` : Prisma.empty}
        )
        ${
          li
            ? Prisma.sql`
        UNION ALL
        SELECT mc.id, b.email, COALESCE(NULLIF(mc.name, ''), b.name, ''), 'legitimate-interest',
          COALESCE(mc.tags, ARRAY[]::text[])
        FROM (
          SELECT DISTINCT ON (p.email) p.email, p."customerName" AS name
          FROM purchases p ORDER BY p.email, p."createdAt" DESC
        ) b
        LEFT JOIN "MarketingContact" mc ON mc.email = b.email
        WHERE mc.id IS NULL OR (mc."legalBasis" IS NULL AND mc."unsubscribedAt" IS NULL)`
            : Prisma.empty
        }
      )
      SELECT a."contactId", a.email, a.name, a.basis FROM base a
      ${rules.length ? Prisma.sql`WHERE ${Prisma.join(rules, ' AND ')}` : Prisma.empty}
      ORDER BY a.email`;
  }

  /** One keyset page of `audienceSql`, without suppressed e-mails; `next` continues the walk. */
  async audiencePage(
    db: Db,
    audience: Prisma.Sql,
    after: string | null,
    limit = AUDIENCE_PAGE,
  ): Promise<{ rows: AudienceRow[]; next: string | null }> {
    const rows = await db.$queryRaw<AudienceRow[]>`
      SELECT * FROM (${audience}) x
      ${after !== null ? Prisma.sql`WHERE x.email > ${after}` : Prisma.empty}
      ORDER BY x.email LIMIT ${limit}`;
    const suppressed = await this.suppressed(
      db,
      rows.map((r) => r.email),
    );
    return {
      rows: rows.filter((r) => !suppressed.has(r.email)),
      next: rows.length === limit ? rows.at(-1)!.email : null,
    };
  }

  async preview(actor: Actor | null, value: unknown) {
    permit(actor, 'marketing');
    const segment = segmentSchema.parse(value),
      audience = this.audienceSql(segment, await this.settings()),
      result = { total: 0, consent: 0, legitimateInterest: 0 };
    for (let after: string | null = null; ;) {
      const page = await this.audiencePage(this.ctx.db, audience, after);
      for (const row of page.rows) {
        result.total++;
        if (row.basis === 'legitimate-interest') result.legitimateInterest++;
        else result.consent++;
      }
      if (!page.next) return result;
      after = page.next;
    }
  }

  /** Settings, tags and totals for the admin snapshot (campaigns come later). */
  async snapshot(): Promise<Omit<AdminCrm, 'campaigns'>> {
    const settings = await this.settings(),
      db = this.ctx.db,
      [contacts, eligible, unsubscribed, tags] = await Promise.all([
        db.marketingContact.count(),
        db.marketingContact.count({
          where: {
            unsubscribedAt: null,
            OR: [
              { legalBasis: { in: ['consent', 'imported-consent'] }, consentAt: { not: null } },
              ...(settings.legitimateInterest ? [{ legalBasis: 'legitimate-interest' }] : []),
            ],
          },
        }),
        db.marketingContact.count({ where: { unsubscribedAt: { not: null } } }),
        db.$queryRaw<{ tag: string; count: number }[]>`
          SELECT t.tag, count(*)::int AS count
          FROM "MarketingContact" mc, unnest(mc.tags) AS t(tag)
          GROUP BY t.tag ORDER BY count(*) DESC, t.tag LIMIT 200`,
      ]);
    return { settings, tags, totals: { contacts, eligible, unsubscribed } };
  }

  private ruleSql(rule: SegmentRule): Prisma.Sql {
    switch (rule.type) {
      case 'product':
        return Prisma.sql`EXISTS (SELECT 1 FROM purchases p JOIN "OrderItem" i ON i."orderId" = p.id
          WHERE p.email = a.email AND i."productId" = ${rule.productId})`;
      case 'category':
        return Prisma.sql`EXISTS (SELECT 1 FROM purchases p JOIN "OrderItem" i ON i."orderId" = p.id
          JOIN "Product" pr ON pr.id = i."productId"
          WHERE p.email = a.email AND pr.category = ${rule.category})`;
      case 'spentAbove':
        return Prisma.sql`(SELECT COALESCE(SUM(p."totalCents"), 0) FROM purchases p
          WHERE p.email = a.email) > ${rule.cents}::bigint`;
      case 'lastPurchase': {
        const last = Prisma.sql`(SELECT max(p."createdAt") FROM purchases p WHERE p.email = a.email)`,
          limit = Prisma.sql`(now() AT TIME ZONE 'UTC') - make_interval(days => ${rule.days}::int)`;
        return rule.op === 'moreThan'
          ? Prisma.sql`${last} < ${limit}`
          : Prisma.sql`${last} >= ${limit}`;
      }
      case 'club':
        return Prisma.sql`EXISTS (SELECT 1 FROM "Subscription" s JOIN "Customer" c ON c.id = s."customerId"
          WHERE s.status = 'Ativa' AND lower(trim(c.email)) = a.email)`;
      case 'prayer':
        return Prisma.sql`EXISTS (SELECT 1 FROM "DevotionalSubscriber" d
          WHERE lower(trim(d.email)) = a.email
            AND d."verifiedAt" IS NOT NULL AND d."unsubscribedAt" IS NULL)`;
      case 'groupBuy':
        return Prisma.sql`EXISTS (SELECT 1 FROM purchases p
          WHERE p.email = a.email AND p."groupBuyId" IS NOT NULL)`;
      case 'tag':
        return Prisma.sql`a.tags @> ARRAY[${rule.tag}]::text[]`;
    }
  }

  /** Same eligibility as the audience, without the suppression list. */
  private eligible(contact: ContactRow, settings: CrmSettings, buyer: boolean) {
    if (canReceiveMarketing(contact, settings)) return true;
    return settings.legitimateInterest && buyer && !contact.legalBasis && !contact.unsubscribedAt;
  }

  private async receives(db: Db, email: string, contact: ContactRow | null, settings: CrmSettings) {
    const buyer =
      settings.legitimateInterest && ((await this.people(db, [email])).get(email)?.buyer ?? false);
    return contact ? this.eligible(contact, settings, buyer) : buyer;
  }

  /** Customers by normalized e-mail (any number of guest rows), and whether they bought. */
  private async people(db: Db, emails: string[]) {
    if (!emails.length) return new Map<string, { buyer: boolean }>();
    const rows = await db.$queryRaw<{ email: string; buyer: boolean }[]>`
      SELECT lower(trim(c.email)) AS email, bool_or(o.id IS NOT NULL) AS buyer
      FROM "Customer" c
      LEFT JOIN "Order" o ON o."customerId" = c.id
        AND o.status NOT IN ('Aguardando pagamento', 'Cancelado')
      WHERE lower(trim(c.email)) IN (${Prisma.join(emails)})
      GROUP BY 1`;
    return new Map(rows.map((r) => [r.email, { buyer: r.buyer }]));
  }

  private async suppressed(db: Db, emails: string[]) {
    if (!emails.length) return new Set<string>();
    const byHash = new Map(emails.map((e) => [recipientHash(e, this.ctx.config), e])),
      rows = await db.emailSuppression.findMany({
        where: { emailHash: { in: [...byHash.keys()] } },
        select: { emailHash: true },
      });
    return new Set(rows.map((r) => byHash.get(r.emailHash)!));
  }

  /** Marks the unsubscribe, creating the contact when needed so legitimate interest stops too. */
  private async markUnsubscribed(tx: Transaction, email: string) {
    const now = new Date(),
      contact = await tx.marketingContact.upsert({
        where: { email },
        create: { email, unsubscribedAt: now },
        update: {},
      });
    await tx.marketingContact.updateMany({
      where: { id: contact.id, unsubscribedAt: null },
      data: { unsubscribedAt: now },
    });
    return contact.id;
  }

  /** The signed-in customer account (not a guest order session, not the team). */
  private async account(actor: Actor | null) {
    const a = requireActor(actor);
    if (a.role !== 'customer')
      throw new DomainError('FORBIDDEN', 'Seu perfil não permite esta operação.', 403);
    if (!a.userId || a.guestOrderId)
      throw new DomainError('UNAUTHORIZED', 'Entre na sua conta para continuar.', 401);
    const user = requireValue(
      await this.ctx.db.user.findUnique({
        where: { id: a.userId },
        select: { email: true, name: true },
      }),
    );
    return { id: a.userId, email: normalizeEmail(user.email), name: user.name };
  }
}

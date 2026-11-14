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
  marketingBlockInputSchema,
  marketingCampaignInputSchema,
  normalizeTag,
  segmentSchema,
  tagSchema,
  type AdminCrm,
  type AdminMarketingCampaign,
  type CampaignMetrics,
  type CampaignState,
  type ConsentSource,
  type CrmSettings,
  type LegalBasis,
  type MarketingContactRow,
  type MarketingStatus,
  type MediaAsset,
  type Segment,
  type SegmentRule,
} from '@maos-em-oracao/contracts';
import type { EmailMessage, RenderedBlock } from '@maos-em-oracao/emails';
import { crmSettings, rateLimit, type Context } from './context';
import { CatalogService } from './catalog';
import { Notifications } from './notifications';
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
type CampaignRow = Prisma.MarketingCampaignGetPayload<object>;
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
  FANOUT_PAGE = 500,
  CAMPAIGN_LIST = 100,
  TESTS_PER_HOUR = 20,
  FIVE_YEARS = 5 * 365.25 * 86400000;
const CAMPAIGN_MISSING = 'Campanha não encontrada.';
const locked = () =>
  new DomainError('CAMPAIGN_LOCKED', 'Esta campanha já foi agendada ou enviada.', 422);
const invalidState = (message: string) => new DomainError('CAMPAIGN_STATE', message, 422);
/** Paid orders only: the same "comprador" rule for legitimate interest and purchase rules. */
const purchases = Prisma.sql`
  SELECT o.id, o."totalCents", o."createdAt", o."groupBuyId",
    lower(trim(c.email)) AS email, c.name AS "customerName"
  FROM "Order" o JOIN "Customer" c ON c.id = o."customerId"
  WHERE o.status NOT IN ('Aguardando pagamento', 'Cancelado')`;
const uniqueTags = (tags: string[]) => [...new Set(tags.map(normalizeTag))];
const iso = (value: Date | null) => (value ? value.toISOString() : null);

function campaignDto(c: CampaignRow, metrics: CampaignMetrics): AdminMarketingCampaign {
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    previewText: c.previewText,
    segment: data<AdminMarketingCampaign['segment']>(c.segment),
    blocks: data<AdminMarketingCampaign['blocks']>(c.blocks),
    state: c.state as CampaignState,
    ...(c.scheduledAt ? { scheduledAt: c.scheduledAt.toISOString() } : {}),
    ...(c.startedAt ? { startedAt: c.startedAt.toISOString() } : {}),
    ...(c.finishedAt ? { finishedAt: c.finishedAt.toISOString() } : {}),
    createdAt: c.createdAt.toISOString(),
    metrics,
  };
}

/** E-mail marketing contacts (LGPD consent and unsubscribe), import, tags and audience. */
export class CrmService {
  private catalog: CatalogService;
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.catalog = new CatalogService(ctx);
    this.mail = new Notifications(ctx);
  }

  /** AppSetting `crm` over the defaults, validated field by field (see `crmSettings`). */
  settings(db: Db = this.ctx.db): Promise<CrmSettings> {
    return crmSettings(db);
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

  /** Admin snapshot: settings, the latest campaigns with metrics, tags and totals. */
  async snapshot(): Promise<AdminCrm> {
    const settings = await this.settings(),
      db = this.ctx.db,
      [contacts, eligible, unsubscribed, tags, campaigns] = await Promise.all([
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
        db.marketingCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: CAMPAIGN_LIST }),
      ]),
      metrics = await this.metrics(campaigns.map((c) => c.id));
    return {
      settings,
      campaigns: campaigns.map((c) => campaignDto(c, metrics[c.id]!)),
      tags,
      totals: { contacts, eligible, unsubscribed },
    };
  }

  // ------------------------------------------------------------------ campanhas

  /** Creates a draft, or edits one that is still a draft. */
  async saveCampaign(actor: Actor | null, value: unknown): Promise<void> {
    const a = permit(actor, 'marketing'),
      input = marketingCampaignInputSchema.parse(value),
      fields = {
        name: input.name,
        subject: input.subject,
        previewText: input.previewText,
        segment: json(input.segment),
        blocks: json(input.blocks),
      };
    await transaction(this.ctx.db, async (tx) => {
      if (input.id) {
        await lock(tx, 'crm-campaign/' + input.id);
        const current = requireValue(
          await tx.marketingCampaign.findUnique({ where: { id: input.id } }),
          CAMPAIGN_MISSING,
        );
        if (current.state !== 'Rascunho') throw locked();
        await tx.marketingCampaign.update({ where: { id: input.id }, data: fields });
        await audit(tx, a.id, 'Campanha de e-mail salva', input.id);
        return;
      }
      const saved = await tx.marketingCampaign.create({ data: { ...fields, createdBy: a.id } });
      await audit(tx, a.id, 'Campanha de e-mail salva', saved.id);
    });
  }

  async deleteCampaign(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'crm-campaign/' + id);
      const current = requireValue(
        await tx.marketingCampaign.findUnique({ where: { id } }),
        CAMPAIGN_MISSING,
      );
      if (current.state !== 'Rascunho') throw locked();
      await tx.marketingCampaign.delete({ where: { id } });
      await audit(tx, a.id, 'Campanha de e-mail excluída', id);
    });
  }

  /**
   * Schedules a draft (or a campaign cancelled before any send) for `at`, or now. The audience
   * must not be empty and every block must resolve (product visible, image ready, coupon active).
   */
  async scheduleCampaign(actor: Actor | null, id: string, at: string | null): Promise<void> {
    const a = permit(actor, 'marketing'),
      now = Date.now(),
      when = at ? new Date(at) : new Date(now);
    if (!Number.isFinite(when.getTime()) || when.getTime() < now - 60000)
      throw new DomainError('SCHEDULE_PAST', 'Escolha um horário futuro.', 422);
    const campaign = requireValue(
      await this.ctx.db.marketingCampaign.findUnique({ where: { id } }),
      CAMPAIGN_MISSING,
    );
    await this.assertSchedulable(this.ctx.db, campaign);
    if (!(await this.preview(a, campaign.segment)).total)
      throw new DomainError('EMPTY_AUDIENCE', 'Nenhum contato pode receber esta campanha.', 422);
    await this.resolveBlocks(campaign.blocks, { strict: true });
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'crm-campaign/' + id);
      const current = requireValue(
        await tx.marketingCampaign.findUnique({ where: { id } }),
        CAMPAIGN_MISSING,
      );
      await this.assertSchedulable(tx, current);
      if (current.updatedAt.getTime() !== campaign.updatedAt.getTime())
        throw invalidState('A campanha mudou enquanto era conferida. Agende de novo.');
      await tx.marketingCampaign.update({
        where: { id },
        data: {
          state: 'Agendada',
          scheduledAt: when,
          startedAt: null,
          preparedAt: null,
          finishedAt: null,
          audienceCount: 0,
          sent: 0,
        },
      });
      await audit(tx, a.id, 'Campanha de e-mail agendada', id);
    });
  }

  /** Stops a scheduled or sending campaign; whatever is still waiting in the queue is dropped. */
  async cancelCampaign(actor: Actor | null, id: string): Promise<void> {
    const a = permit(actor, 'marketing');
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'crm-campaign/' + id);
      const current = requireValue(
        await tx.marketingCampaign.findUnique({ where: { id } }),
        CAMPAIGN_MISSING,
      );
      if (current.state !== 'Agendada' && current.state !== 'Enviando')
        throw invalidState('Só uma campanha agendada ou em envio pode ser cancelada.');
      await tx.marketingCampaign.update({
        where: { id },
        data: { state: 'Cancelada', finishedAt: new Date() },
      });
      await tx.outboxEvent.updateMany({
        where: { aggregateId: id, state: 'pending' },
        data: { state: 'cancelled', errorCode: 'CAMPAIGN_CANCELLED' },
      });
      await audit(tx, a.id, 'Campanha de e-mail cancelada', id);
    });
  }

  /**
   * Sends the campaign as it is to the actor and up to 3 more addresses. It never touches the
   * campaign: the outbox is not tied to it (aggregate `crm-test/<id>`) and the unsubscribe link
   * uses the fixed id `test`, which matches no contact.
   */
  async testCampaign(actor: Actor | null, id: string, extra: string[]): Promise<void> {
    const a = permit(actor, 'marketing'),
      others = z.array(z.email().max(254)).max(CRM_LIMITS.testRecipients).parse(extra),
      recipients = [...new Set([a.email, ...others].map(normalizeEmail))];
    await rateLimit(this.ctx, 'crm-test/' + a.id, TESTS_PER_HOUR, 3600000);
    const campaign = requireValue(
        await this.ctx.db.marketingCampaign.findUnique({ where: { id } }),
        CAMPAIGN_MISSING,
      ),
      [blocks, settings] = await Promise.all([
        this.resolveBlocks(campaign.blocks, { strict: true }),
        this.settings(),
      ]),
      key = 'crm-test/' + id + '/' + Date.now(),
      message = this.message(campaign, blocks, settings, 'teste', this.unsubscribeLinks('test'));
    await transaction(this.ctx.db, async (tx) => {
      for (const to of recipients)
        await this.mail.email(tx, key, 'crm-test/' + id, to, message, { marketingTest: true });
    });
  }

  /**
   * Blocks as the e-mail renders them. Images must be ready, products visible in the store
   * (same rule as the catalog) and coupons active. `strict` (scheduling, tests) throws on the
   * first invalid item; otherwise (the send) it drops it, and drops a products block left empty.
   */
  async resolveBlocks(blocks: unknown, { strict }: { strict: boolean }): Promise<RenderedBlock[]> {
    const input = z.array(marketingBlockInputSchema).parse(blocks),
      base = this.ctx.config.PUBLIC_WEB_URL,
      assetIds = input.flatMap((b) => (b.type === 'image' ? [b.assetId] : [])),
      codes = input.flatMap((b) => (b.type === 'coupon' ? [b.code] : [])),
      [assets, products, coupons] = await Promise.all([
        assetIds.length
          ? this.ctx.db.mediaAsset.findMany({
              where: { id: { in: assetIds }, kind: 'image', state: 'ready' },
            })
          : [],
        this.catalog.visible([
          ...new Set(input.flatMap((b) => (b.type === 'products' ? b.productIds : []))),
        ]),
        codes.length
          ? this.ctx.db.coupon.findMany({
              where: { code: { in: codes }, active: true },
              select: { code: true },
            })
          : [],
      ]);
    const images = new Map(assets.map((a) => [a.id, data<Partial<MediaAsset>>(a.data).url])),
      active = new Set(coupons.map((c) => c.code)),
      invalid = (code: string, message: string): RenderedBlock[] => {
        if (strict) throw new DomainError(code, message, 422);
        return [];
      };
    return input.flatMap((block): RenderedBlock[] => {
      switch (block.type) {
        case 'text':
          return [{ type: 'text', style: block.style, text: block.text }];
        case 'image': {
          const url = images.get(block.assetId);
          if (!url) return invalid('INVALID_IMAGE', 'Envie uma imagem pronta.');
          return [
            {
              type: 'image',
              src: new URL(url, base).href,
              alt: block.alt,
              ...(block.href ? { href: block.href } : {}),
            },
          ];
        }
        case 'products': {
          const items = block.productIds.flatMap((id) => {
            const p = products.get(id);
            return p
              ? [
                  {
                    name: p.name,
                    priceCents: p.priceCents,
                    imageUrl: new URL(p.image || '/', base).href,
                    url: base + '/produto/' + p.id,
                  },
                ]
              : [];
          });
          if (items.length < block.productIds.length && strict)
            return invalid('INVALID_PRODUCT', 'Escolha peças existentes e visíveis na loja.');
          return items.length ? [{ type: 'products', items }] : [];
        }
        case 'button':
          return [{ type: 'button', label: block.label, href: block.href }];
        case 'coupon':
          return active.has(block.code)
            ? [{ type: 'coupon', code: block.code, text: block.text }]
            : invalid('INVALID_COUPON', 'Cupom inexistente ou inativo.');
      }
    });
  }

  /**
   * Outbox job `crm-campaign`: one e-mail per audience line, spaced by the hourly limit from
   * `startedAt`. The index of a line is its position in the e-mail order, so a repeated run
   * computes the same times, and the outbox key keeps it from creating anything twice.
   */
  async fanout(id: string): Promise<void> {
    const db = this.ctx.db,
      campaign = requireValue(
        await db.marketingCampaign.findUnique({ where: { id } }),
        CAMPAIGN_MISSING,
      ),
      startedAt = campaign.startedAt ?? new Date();
    const started = await db.marketingCampaign.updateMany({
      where: { id, state: { in: ['Agendada', 'Enviando'] } },
      data: { state: 'Enviando', startedAt },
    });
    if (!started.count) return;
    const settings = await this.settings(),
      blocks = await this.resolveBlocks(campaign.blocks, { strict: false });
    if (!blocks.length) {
      const now = new Date();
      await db.marketingCampaign.updateMany({
        where: { id, state: 'Enviando' },
        data: { state: 'Parcial', preparedAt: now, finishedAt: now },
      });
      return;
    }
    const audience = this.audienceSql(segmentSchema.parse(campaign.segment), settings),
      spacing = 3600000 / settings.hourlyLimit;
    let index = 0;
    for (let after: string | null = null; ;) {
      const current = await db.marketingCampaign.findUnique({
        where: { id },
        select: { state: true },
      });
      if (current?.state !== 'Enviando') return;
      // Renews the job's 2-minute lease, so a large audience is not prepared twice at once.
      await db.outboxEvent.updateMany({
        where: { key: 'crm-campaign/' + id, state: 'processing' },
        data: { availableAt: new Date(Date.now() + 120000) },
      });
      const page = await this.audiencePage(db, audience, after, FANOUT_PAGE);
      for (const row of page.rows) {
        const availableAt = new Date(startedAt.getTime() + index++ * spacing);
        await transaction(db, async (tx) => {
          const contactId = await this.audienceContact(tx, row);
          await this.mail.email(
            tx,
            'crm/' + id + '/' + contactId,
            id,
            row.email,
            this.message(
              campaign,
              blocks,
              settings,
              row.name,
              this.unsubscribeLinks(contactId, id),
            ),
            { contactId, marketingCampaignId: id },
            { availableAt },
          );
        });
      }
      if (!page.next) break;
      after = page.next;
    }
    await db.marketingCampaign.updateMany({
      where: { id, state: 'Enviando' },
      data: { audienceCount: index, preparedAt: new Date() },
    });
  }

  /** Per campaign: audience, sent, delivery outcome, unique opens/clicks and unsubscribes. */
  async metrics(ids: string[]): Promise<Record<string, CampaignMetrics>> {
    if (!ids.length) return {};
    const db = this.ctx.db,
      [states, engagement, unsubscribed, campaigns] = await Promise.all([
        db.outboxEvent.groupBy({
          by: ['aggregateId', 'state'],
          where: { kind: 'email', aggregateId: { in: ids } },
          _count: { _all: true },
        }),
        db.$queryRaw<{ id: string; type: string; count: number }[]>`
          SELECT o."aggregateId" AS id, e.type, count(DISTINCT e."providerId")::int AS count
          FROM "EmailDeliveryEvent" e JOIN "OutboxEvent" o ON o."providerId" = e."providerId"
          WHERE o.kind = 'email' AND o."aggregateId" IN (${Prisma.join(ids)})
            AND e.type IN ('email.opened', 'email.clicked')
          GROUP BY 1, 2`,
        db.marketingContact.groupBy({
          by: ['unsubscribedCampaignId'],
          where: { unsubscribedCampaignId: { in: ids } },
          _count: { _all: true },
        }),
        db.marketingCampaign.findMany({
          where: { id: { in: ids } },
          select: { id: true, audienceCount: true, sent: true },
        }),
      ]);
    const result: Record<string, CampaignMetrics> = Object.fromEntries(
      campaigns.map((c) => [
        c.id,
        {
          audience: c.audienceCount,
          sent: c.sent,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          cancelled: 0,
        },
      ]),
    );
    for (const row of states) {
      const m = result[row.aggregateId];
      if (!m) continue;
      if (row.state === 'delivered') m.delivered += row._count._all;
      else if (['bounced', 'complained', 'suppressed'].includes(row.state))
        m.bounced += row._count._all;
      else if (row.state === 'cancelled') m.cancelled += row._count._all;
    }
    for (const row of engagement) {
      const m = result[row.id];
      if (m) m[row.type === 'email.opened' ? 'opened' : 'clicked'] += row.count;
    }
    for (const row of unsubscribed) {
      const m = row.unsubscribedCampaignId ? result[row.unsubscribedCampaignId] : undefined;
      if (m) m.unsubscribed += row._count._all;
    }
    return result;
  }

  private async assertSchedulable(db: Db, campaign: CampaignRow) {
    if (
      (campaign.state !== 'Rascunho' && campaign.state !== 'Cancelada') ||
      (await db.outboxEvent.findFirst({
        where: { aggregateId: campaign.id },
        select: { id: true },
      }))
    )
      throw invalidState('Esta campanha não pode ser agendada de novo.');
  }

  /**
   * The contact behind an audience line. A legitimate-interest buyer without contact gets one,
   * and a contact without basis gets the legitimate-interest basis; the unsubscribe is never
   * touched, so the worker still drops anyone who left meanwhile.
   */
  private async audienceContact(tx: Transaction, row: AudienceRow): Promise<string> {
    if (row.contactId && row.basis !== 'legitimate-interest') return row.contactId;
    const id =
      row.contactId ??
      (
        await tx.marketingContact.upsert({
          where: { email: row.email },
          create: {
            email: row.email,
            name: row.name.slice(0, 100),
            legalBasis: 'legitimate-interest',
          },
          update: {},
          select: { id: true },
        })
      ).id;
    await tx.marketingContact.updateMany({
      where: { id, legalBasis: null },
      data: { legalBasis: 'legitimate-interest' },
    });
    return id;
  }

  private message(
    campaign: CampaignRow,
    blocks: RenderedBlock[],
    settings: CrmSettings,
    name: string,
    links: { unsubscribeUrl: string; oneClickUnsubscribeUrl: string },
  ): EmailMessage {
    return {
      kind: 'marketing',
      name: name.replace(/[\r\n]+/g, ' ').trim() || 'pessoa querida',
      actionUrl: this.ctx.config.PUBLIC_WEB_URL,
      subject: campaign.subject,
      previewText: campaign.previewText,
      blocks,
      footerText: settings.footerText,
      ...links,
    };
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

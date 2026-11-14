import { z } from 'zod';
import {
  CRM_LIMITS,
  MARKETING_CONSENT_TEXT,
  MARKETING_CONSENT_VERSION,
  canReceiveMarketing,
  contactImportSchema,
  crmSettingsSchema,
  defaultCrmSettings,
  marketingBlockInputSchema,
  marketingCampaignInputSchema,
  normalizeTag,
  tagSchema,
  type AdminCrm,
  type AdminMarketingCampaign,
  type ConsentSource,
  type ContactImportInput,
  type LegalBasis,
  type MarketingContactRow,
  type MarketingStatus,
  type Segment,
} from '@maos-em-oracao/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import type {
  CrmContactsPage,
  CrmContactsQuery,
  CrmImportResult,
  CrmPreview,
} from '@/lib/api/contracts';
import type { AdminCommand, Customer, Operations } from '@/lib/domain/types';
/** A marketing contact kept only by the demo (the API keeps them in the database). */
export interface DemoContact {
  id: string;
  email: string;
  name: string;
  legalBasis: LegalBasis | null;
  consentAt: string | null;
  consentSource: ConsentSource | null;
  unsubscribedAt: string | null;
  tags: string[];
}
type DemoState = Operations & { crmContacts?: DemoContact[] };
export const IMPORTED_TAG = 'Paróquia São José';
const SEED_CONSENT_AT = '2026-10-01T12:00:00.000Z';
const email = (value: string) => value.trim().toLowerCase();
export function seedContacts(clients: Pick<Customer, 'id' | 'name' | 'email'>[]): DemoContact[] {
  return [
    ...clients.map((c): DemoContact => ({
      id: `CTT-${c.id}`,
      email: email(c.email),
      name: c.name,
      legalBasis: 'consent',
      consentAt: SEED_CONSENT_AT,
      consentSource: 'checkout',
      unsubscribedAt: null,
      tags: [],
    })),
    {
      id: 'CTT-IMPORT-1',
      email: 'secretaria@paroquiasaojose.example',
      name: 'Secretaria da Paróquia São José',
      legalBasis: 'imported-consent',
      consentAt: SEED_CONSENT_AT,
      consentSource: 'import',
      unsubscribedAt: null,
      tags: [IMPORTED_TAG],
    },
  ];
}
function seedCampaign(): AdminMarketingCampaign {
  return {
    id: 'campanha-demo',
    name: 'Novidades de outubro',
    subject: 'Novidades da oficina em outubro',
    previewText: 'Peças novas e um cupom para você.',
    segment: { rules: [] },
    blocks: [
      { type: 'text', style: 'heading', text: 'Novidades da oficina' },
      { type: 'text', style: 'paragraph', text: 'Peças novas feitas com carinho para o seu lar.' },
    ],
    state: 'Enviada',
    scheduledAt: '2026-10-20T13:00:00.000Z',
    startedAt: '2026-10-20T13:00:00.000Z',
    finishedAt: '2026-10-20T13:05:00.000Z',
    createdAt: '2026-10-18T10:00:00.000Z',
    metrics: {
      audience: 3,
      sent: 3,
      delivered: 3,
      opened: 2,
      clicked: 1,
      bounced: 0,
      unsubscribed: 0,
      cancelled: 0,
    },
  };
}
function summarize(contacts: DemoContact[], settings: AdminCrm['settings']) {
  const tags = new Map<string, number>();
  for (const c of contacts) for (const tag of c.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  return {
    tags: [...tags]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag)),
    totals: {
      contacts: contacts.length,
      eligible: contacts.filter((c) => canReceiveMarketing(c, settings)).length,
      unsubscribed: contacts.filter((c) => c.unsubscribedAt).length,
    },
  };
}
/** The CRM block of the seed: derived from the same contacts the gateway lists. */
export function seedCrm(clients: Pick<Customer, 'id' | 'name' | 'email'>[]): AdminCrm {
  return {
    settings: defaultCrmSettings,
    campaigns: [seedCampaign()],
    ...summarize(seedContacts(clients), defaultCrmSettings),
  };
}
/** Contacts live next to the snapshot; a state saved before the CRM existed derives them from its customers. */
export function contactsOf(state: Operations): DemoContact[] {
  const s = state as DemoState;
  return (s.crmContacts ??= seedContacts(state.clients));
}
/** Recomputes the tag counts and totals of the snapshot after any contact change. */
export function refreshCrm(state: Operations) {
  Object.assign(state.crm, summarize(contactsOf(state), state.crm.settings));
}
function upsert(
  state: Operations,
  input: { email: string; name?: string },
  apply: (contact: DemoContact, created: boolean) => void,
) {
  const contacts = contactsOf(state),
    key = email(input.email);
  let contact = contacts.find((c) => c.email === key);
  const created = !contact;
  if (!contact) {
    contact = {
      id: `CTT-${crypto.randomUUID()}`,
      email: key,
      name: input.name?.trim() ?? '',
      legalBasis: null,
      consentAt: null,
      consentSource: null,
      unsubscribedAt: null,
      tags: [],
    };
    contacts.push(contact);
  } else if (input.name?.trim() && !contact.name) contact.name = input.name.trim();
  apply(contact, created);
  refreshCrm(state);
  return contact;
}
/** Records the opt-in given at registration or checkout (unsubscribed contacts only come back from their own account). */
export function registerConsent(
  state: Operations,
  input: { email: string; name?: string },
  source: ConsentSource,
) {
  upsert(state, input, (contact) => {
    if (contact.unsubscribedAt) return;
    if (contact.legalBasis === 'consent' && contact.consentAt) return;
    Object.assign(contact, {
      legalBasis: 'consent',
      consentAt: new Date().toISOString(),
      consentSource: source,
    });
  });
}
export function marketingStatus(state: Operations, accountEmail: string): MarketingStatus {
  const contact = contactsOf(state).find((c) => c.email === email(accountEmail));
  return {
    subscribed: Boolean(contact && canReceiveMarketing(contact, state.crm.settings)),
    text: MARKETING_CONSENT_TEXT,
    version: MARKETING_CONSENT_VERSION,
  };
}
export function setMarketing(
  state: Operations,
  account: { email: string; name?: string },
  subscribed: boolean,
) {
  upsert(state, account, (contact) => {
    if (!subscribed) {
      contact.unsubscribedAt ??= new Date().toISOString();
      return;
    }
    Object.assign(contact, {
      legalBasis: 'consent',
      consentAt: new Date().toISOString(),
      consentSource: 'account',
      unsubscribedAt: null,
    });
  });
}
/** The demo has no signed links: the token is the contact id (or its e-mail). An unknown token is ignored. */
export function unsubscribeByToken(state: Operations, token: string) {
  const contact = contactsOf(state).find((c) => c.id === token || c.email === email(token));
  if (!contact) return;
  contact.unsubscribedAt ??= new Date().toISOString();
  refreshCrm(state);
}
const customerEmails = (state: Operations) => new Set(state.clients.map((c) => email(c.email)));
const toRow =
  (state: Operations, customers: Set<string>) =>
  (c: DemoContact): MarketingContactRow => ({
    ...c,
    tags: [...c.tags],
    eligible: canReceiveMarketing(c, state.crm.settings),
    isCustomer: customers.has(c.email),
  });
export function listContacts(state: Operations, query: CrmContactsQuery = {}): CrmContactsPage {
  const q = query.q?.trim().toLowerCase(),
    customers = customerEmails(state),
    matches = contactsOf(state)
      .filter(
        (c) =>
          (!q || c.email.includes(q) || c.name.toLowerCase().includes(q)) &&
          (!query.tag || c.tags.includes(normalizeTag(query.tag))) &&
          (!query.cursor || c.email > query.cursor),
      )
      .sort((a, b) => a.email.localeCompare(b.email)),
    page = matches.slice(0, 50);
  return {
    items: page.map(toRow(state, customers)),
    ...(matches.length > page.length ? { next: page[page.length - 1].email } : {}),
  };
}
/** Only the `tag` rule narrows the audience here: purchase-based rules need the API's order data. */
export function previewSegment(state: Operations, segment: Segment): CrmPreview {
  const tags = segment.rules.flatMap((r) => (r.type === 'tag' ? [r.tag] : [])),
    audience = contactsOf(state).filter(
      (c) => canReceiveMarketing(c, state.crm.settings) && tags.every((t) => c.tags.includes(t)),
    ),
    legitimateInterest = audience.filter((c) => c.legalBasis === 'legitimate-interest').length;
  return {
    total: audience.length,
    consent: audience.length - legitimateInterest,
    legitimateInterest,
  };
}
export function importContacts(state: Operations, raw: ContactImportInput): CrmImportResult {
  const input = contactImportSchema.parse(raw),
    result = { created: 0, updated: 0, keptUnsubscribed: 0 },
    seen = new Set<string>();
  for (const row of input.rows) {
    const key = email(row.email);
    if (seen.has(key)) continue;
    seen.add(key);
    upsert(state, { email: key, name: row.name }, (contact, created) => {
      if (created) result.created++;
      else if (contact.unsubscribedAt) result.keptUnsubscribed++;
      else result.updated++;
      if (!contact.tags.includes(input.tag)) contact.tags.push(input.tag);
      if (!contact.legalBasis && !contact.unsubscribedAt)
        Object.assign(contact, {
          legalBasis: 'imported-consent',
          consentAt: new Date().toISOString(),
          consentSource: 'import',
        });
    });
  }
  return result;
}
// ------------------------------------------------------------------- comandos
const contactCommand = z.object({
  email: z.email().max(254),
  name: z.string().trim().max(100).optional(),
  tags: z.array(tagSchema).max(CRM_LIMITS.tags),
});
/** Demo ids are not UUIDs: swap them for stable UUIDs while the contract validates, then keep the originals. */
function validateCampaign(input: unknown) {
  const ids = new Map<string, string>(),
    stand = (id: unknown) => {
      const key = String(id);
      if (!ids.has(key)) ids.set(key, crypto.randomUUID());
      return ids.get(key)!;
    },
    campaign = z
      .object({ blocks: z.array(z.record(z.string(), z.unknown())) })
      .loose()
      .parse(input),
    relaxed = campaign.blocks.map((b) =>
      b.type === 'image'
        ? { ...b, assetId: stand(b.assetId) }
        : b.type === 'products' && Array.isArray(b.productIds)
          ? { ...b, productIds: b.productIds.map(stand) }
          : b,
    ),
    parsed = marketingCampaignInputSchema.parse({ ...campaign, id: undefined, blocks: relaxed }),
    original = campaign.blocks;
  return {
    ...parsed,
    blocks: parsed.blocks.map((block, i) =>
      block.type === 'image'
        ? { ...block, assetId: String(original[i].assetId) }
        : block.type === 'products'
          ? { ...block, productIds: original[i].productIds as string[] }
          : marketingBlockInputSchema.parse(block),
    ),
  };
}
const campaignOf = (state: Operations, id: string) =>
  requireValue(
    state.crm.campaigns.find((c) => c.id === id),
    'Campanha não encontrada.',
  );
const stateError = (message: string) => new ApiError('CAMPAIGN_STATE', message, 422);
/** Applies a `crm.*` command to the local state; returns false for any other command. */
export function applyCrmCommand(state: Operations, command: AdminCommand): boolean {
  switch (command.type) {
    case 'crm.settings':
      state.crm.settings = crmSettingsSchema.parse(command.settings);
      refreshCrm(state);
      return true;
    case 'crm.contact.save': {
      const input = contactCommand.parse(command);
      upsert(state, input, (contact) => {
        contact.tags = [...new Set(input.tags)];
        if (input.name) contact.name = input.name;
        if (!contact.legalBasis && !contact.unsubscribedAt)
          Object.assign(contact, {
            legalBasis: 'consent',
            consentAt: new Date().toISOString(),
            consentSource: 'account',
          });
      });
      return true;
    }
    case 'crm.contact.unsubscribe': {
      const address = z.email().max(254).parse(command.email);
      upsert(state, { email: address }, (contact) => {
        contact.unsubscribedAt ??= new Date().toISOString();
      });
      return true;
    }
    case 'crm.campaign.save': {
      const input = validateCampaign(command.campaign),
        existing = command.campaign.id ? campaignOf(state, command.campaign.id) : undefined;
      if (existing && existing.state !== 'Rascunho')
        throw stateError('Esta campanha já foi agendada ou enviada.');
      const blank = {
        audience: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        cancelled: 0,
      };
      if (existing) Object.assign(existing, input);
      else
        state.crm.campaigns.unshift({
          ...input,
          id: `campanha-${crypto.randomUUID()}`,
          state: 'Rascunho',
          createdAt: new Date().toISOString(),
          metrics: blank,
        });
      return true;
    }
    case 'crm.campaign.schedule': {
      const campaign = campaignOf(state, command.id);
      if (campaign.state !== 'Rascunho' && campaign.state !== 'Agendada')
        throw stateError('Só campanhas em rascunho podem ser agendadas.');
      // The demo sends nothing: scheduling goes straight to "Agendada".
      campaign.state = 'Agendada';
      campaign.scheduledAt = command.at ?? new Date().toISOString();
      return true;
    }
    case 'crm.campaign.test':
      // Nothing is sent in the demo; only the recipients are checked.
      campaignOf(state, command.id);
      z.array(z.email()).max(CRM_LIMITS.testRecipients).parse(command.extra);
      return true;
    case 'crm.campaign.cancel': {
      const campaign = campaignOf(state, command.id);
      if (!['Agendada', 'Enviando'].includes(campaign.state))
        throw stateError('Só campanhas agendadas ou em envio podem ser canceladas.');
      campaign.state = 'Cancelada';
      return true;
    }
    case 'crm.campaign.delete': {
      const campaign = campaignOf(state, command.id);
      if (!['Rascunho', 'Cancelada'].includes(campaign.state))
        throw stateError('Só rascunhos e campanhas canceladas podem ser excluídas.');
      state.crm.campaigns = state.crm.campaigns.filter((c) => c.id !== campaign.id);
      return true;
    }
    default:
      return false;
  }
}

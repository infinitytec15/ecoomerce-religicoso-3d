import { createHash } from 'node:crypto';
import { providerJson, type Fetcher } from './http';

const GRAPH_VERSION = 'v21.0';

export interface MetaConfig {
  META_PIXEL_ID?: string;
  META_CAPI_TOKEN?: string;
  META_TEST_EVENT_CODE?: string;
}

/** Customer data before hashing; Meta matches on the normalized SHA-256 of each field. */
export interface MetaCustomer {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  externalId?: string;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
}

export interface MetaPurchase {
  /** Same id the browser pixel sends as eventID, so Meta counts the sale once. */
  eventId: string;
  eventTime: Date;
  sourceUrl: string;
  valueCents: number;
  contentIds: string[];
  numItems: number;
  customer: MetaCustomer;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Brazilian numbers are sent with the country code, digits only, as Meta asks. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits;
}

export function metaUserData(c: MetaCustomer): Record<string, unknown> {
  const hashed = (value: string | undefined, normalize: (v: string) => string) => {
    const v = value ? normalize(value) : '';
    return v ? [sha256(v)] : undefined;
  };
  const data: Record<string, unknown> = {
    em: hashed(c.email, (v) => v.trim().toLowerCase()),
    ph: hashed(c.phone, normalizePhone),
    fn: hashed(c.firstName, plain),
    ln: hashed(c.lastName, plain),
    ct: hashed(c.city, plain),
    st: hashed(c.state, plain),
    zp: hashed(c.zip, (v) => v.replace(/\D/g, '')),
    country: hashed(c.country || 'br', plain),
    external_id: hashed(c.externalId, (v) => v.trim()),
    fbp: c.fbp || undefined,
    fbc: c.fbc || undefined,
    client_user_agent: c.userAgent || undefined,
  };
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

export function metaEnabled(config: MetaConfig): boolean {
  return Boolean(config.META_PIXEL_ID && config.META_CAPI_TOKEN);
}

/** Sends one Purchase to the Meta Conversions API. Does nothing when it is not configured. */
export async function sendMetaPurchase(
  config: MetaConfig,
  purchase: MetaPurchase,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (!metaEnabled(config)) return false;
  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(purchase.eventTime.getTime() / 1000),
        event_id: purchase.eventId,
        action_source: 'website',
        event_source_url: purchase.sourceUrl,
        user_data: metaUserData(purchase.customer),
        custom_data: {
          currency: 'BRL',
          value: purchase.valueCents / 100,
          content_type: 'product',
          content_ids: purchase.contentIds,
          num_items: purchase.numItems,
          order_id: purchase.eventId,
        },
      },
    ],
    ...(config.META_TEST_EVENT_CODE ? { test_event_code: config.META_TEST_EVENT_CODE } : {}),
    // In the body, not the URL, so the token never lands in proxy or request logs.
    access_token: config.META_CAPI_TOKEN,
  };
  await providerJson<unknown>(
    'Meta',
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      config.META_PIXEL_ID as string,
    )}/events`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    fetcher,
  );
  return true;
}

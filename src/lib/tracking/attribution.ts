'use client';
import type { Attribution } from '@maos-em-oracao/contracts';
import { readConsent } from './consent';

const KEY = 'meo-attribution';
/** A campaign click counts for 30 days, like the default ad attribution window. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PARAMS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
  fbclid: 'fbclid',
  gclid: 'gclid',
} as const;

type Stored = Partial<Attribution> & { savedAt?: number };

const clip = (value: string) => value.trim().slice(0, 300);

function read(): Stored {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) || '{}') as Stored;
    return stored.savedAt && Date.now() - stored.savedAt < TTL_MS ? stored : {};
  } catch {
    return {};
  }
}

/**
 * Keeps the campaign of the last ad or link the visitor came from (last click). Called on
 * every page view; only a URL with campaign parameters replaces what is stored.
 */
export function captureAttribution(url: URL = new URL(window.location.href)): void {
  const found: Stored = {};
  for (const [param, field] of Object.entries(PARAMS)) {
    const value = url.searchParams.get(param);
    if (value) found[field] = clip(value);
  }
  if (!Object.keys(found).length) return;
  if (found.fbclid) found.fbc = `fb.1.${Date.now()}.${found.fbclid}`;
  const value: Stored = {
    ...found,
    landingPage: clip(url.origin + url.pathname),
    referrer: document.referrer ? clip(document.referrer) : undefined,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the order simply goes without a campaign.
  }
}

function cookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? clip(decodeURIComponent(match[1])) : undefined;
}

/** What goes with the order. Meta browser ids are sent only with marketing consent. */
export function currentAttribution(): Attribution | undefined {
  if (typeof window === 'undefined') return undefined;
  const stored = Object.fromEntries(
      Object.entries(read()).filter(([key]) => key !== 'savedAt'),
    ) as Partial<Attribution>,
    marketing = readConsent()?.marketing === true;
  const value: Attribution = {
    ...stored,
    ...(marketing
      ? {
          fbp: cookie('_fbp'),
          fbc: cookie('_fbc') || stored.fbc,
          userAgent: navigator.userAgent.slice(0, 500),
        }
      : { fbc: undefined, fbclid: undefined }),
    marketingConsent: marketing,
  };
  const clean = Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ''),
  ) as Attribution;
  return Object.keys(clean).length ? clean : undefined;
}

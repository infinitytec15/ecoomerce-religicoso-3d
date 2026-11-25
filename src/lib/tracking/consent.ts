'use client';
import { useSyncExternalStore } from 'react';

/** What the visitor allowed. Essential cookies (session, cart) never need consent. */
export interface CookieConsent {
  analytics: boolean;
  marketing: boolean;
  /** ISO date of the choice, kept as proof of consent (LGPD art. 8). */
  at: string;
  version: number;
}

const KEY = 'meo-cookie-consent';
/** Bump when the categories change, so everyone is asked again. */
export const CONSENT_VERSION = 1;
const EVENT = 'meo-consent-change';
const OPEN_EVENT = 'meo-consent-open';

let cached: { raw: string | null; value: CookieConsent | null } = { raw: null, value: null };

export function readConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cached.raw) return cached.value;
  let value: CookieConsent | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<CookieConsent>) : null;
    if (parsed && parsed.version === CONSENT_VERSION)
      value = {
        analytics: parsed.analytics === true,
        marketing: parsed.marketing === true,
        at: String(parsed.at ?? ''),
        version: CONSENT_VERSION,
      };
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): void {
  const value: CookieConsent = {
    ...choice,
    at: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private mode: the choice lasts for this page only, which still respects it.
    cached = { raw: JSON.stringify(value), value };
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Reopens the cookie banner (footer and privacy page link). */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onConsentOpen(listener: () => void): () => void {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** `undefined` while rendering on the server, `null` when the visitor has not chosen yet. */
export function useConsent(): CookieConsent | null | undefined {
  return useSyncExternalStore(subscribe, readConsent, () => undefined);
}

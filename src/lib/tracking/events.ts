'use client';

type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fbq;
    gtag?: Gtag;
  }
}

/** Public ids: they ship in the page anyway. Overridable per environment at build time. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '2024262518270324';
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || '';

export interface TrackedItem {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export type StoreEvent =
  | { name: 'ViewContent'; item: TrackedItem }
  | { name: 'AddToCart'; item: TrackedItem }
  | { name: 'InitiateCheckout'; items: TrackedItem[]; valueCents: number }
  | { name: 'Purchase'; orderId: string; items: TrackedItem[]; valueCents: number };

const GA_NAMES: Record<StoreEvent['name'], string> = {
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
};

const reais = (cents: number) => Math.round(cents) / 100;

/** Cart and order lines share these fields. */
export const trackedItem = (line: {
  productId: string;
  name: string;
  unitCents: number;
  quantity: number;
}): TrackedItem => ({
  id: line.productId,
  name: line.name,
  priceCents: line.unitCents,
  quantity: line.quantity,
});

/**
 * Sends a store event to whichever trackers the visitor allowed. Scripts are only loaded with
 * consent, so without it `fbq`/`gtag` do not exist and this does nothing.
 */
export function track(event: StoreEvent): void {
  if (typeof window === 'undefined') return;
  const items = 'item' in event ? [event.item] : event.items,
    value =
      'valueCents' in event
        ? reais(event.valueCents)
        : reais(items.reduce((n, i) => n + i.priceCents * i.quantity, 0));
  try {
    window.fbq?.(
      'track',
      event.name,
      {
        currency: 'BRL',
        value,
        content_type: 'product',
        content_ids: [...new Set(items.map((i) => i.id))],
        contents: items.map((i) => ({ id: i.id, quantity: i.quantity })),
        num_items: items.reduce((n, i) => n + i.quantity, 0),
      },
      // Same id the server sends to the Conversions API, so Meta counts the sale once.
      event.name === 'Purchase' ? { eventID: event.orderId } : undefined,
    );
    window.gtag?.('event', GA_NAMES[event.name], {
      currency: 'BRL',
      value,
      ...(event.name === 'Purchase' ? { transaction_id: event.orderId } : {}),
      items: items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        price: reais(i.priceCents),
        quantity: i.quantity,
      })),
    });
  } catch {
    // A blocked or half-loaded tracker must never break the store.
  }
}

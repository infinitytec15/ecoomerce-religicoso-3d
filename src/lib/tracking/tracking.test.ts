import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAttribution, currentAttribution } from './attribution';
import { readConsent, saveConsent } from './consent';
import { track } from './events';
import { whatsappNumber } from '@/components/layout/whatsapp-button';

describe('tracking', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = '_fbp=; max-age=0';
  });
  afterEach(() => {
    delete window.fbq;
    delete window.gtag;
  });

  it('keeps the campaign of the ad link the visitor arrived from', () => {
    captureAttribution(
      new URL(
        'https://maosemoracao.com.br/produto/x?utm_source=meta&utm_campaign=natal&fbclid=abc',
      ),
    );
    // A later page without campaign parameters does not erase it.
    captureAttribution(new URL('https://maosemoracao.com.br/carrinho'));
    expect(currentAttribution()).toMatchObject({
      utmSource: 'meta',
      utmCampaign: 'natal',
      landingPage: 'https://maosemoracao.com.br/produto/x',
      marketingConsent: false,
    });
  });

  it('sends Meta browser ids only with marketing consent', () => {
    captureAttribution(new URL('https://maosemoracao.com.br/?fbclid=abc'));
    document.cookie = '_fbp=fb.1.1.2';
    expect(currentAttribution()).not.toHaveProperty('fbp');
    expect(currentAttribution()).not.toHaveProperty('fbclid');
    saveConsent({ analytics: false, marketing: true });
    expect(currentAttribution()).toMatchObject({
      fbp: 'fb.1.1.2',
      fbc: expect.stringMatching(/^fb\.1\.\d+\.abc$/),
      marketingConsent: true,
    });
  });

  it('remembers the cookie choice', () => {
    expect(readConsent()).toBeNull();
    saveConsent({ analytics: true, marketing: false });
    expect(readConsent()).toMatchObject({ analytics: true, marketing: false });
  });

  it('reports a purchase to both trackers with the order id', () => {
    window.fbq = vi.fn();
    window.gtag = vi.fn();
    track({
      name: 'Purchase',
      orderId: 'order-1',
      valueCents: 4990,
      items: [{ id: 'kit', name: 'Kit', priceCents: 4990, quantity: 1 }],
    });
    expect(window.fbq).toHaveBeenCalledWith(
      'track',
      'Purchase',
      expect.objectContaining({ currency: 'BRL', value: 49.9, content_ids: ['kit'] }),
      { eventID: 'order-1' },
    );
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'purchase',
      expect.objectContaining({ transaction_id: 'order-1', value: 49.9 }),
    );
  });

  it('does nothing when no tracker was allowed to load', () => {
    expect(() =>
      track({ name: 'AddToCart', item: { id: 'x', name: 'X', priceCents: 100, quantity: 1 } }),
    ).not.toThrow();
  });

  it('builds the WhatsApp number with the country code', () => {
    expect(whatsappNumber('41991517346')).toBe('5541991517346');
    expect(whatsappNumber('+55 (41) 99151-7346')).toBe('5541991517346');
    expect(whatsappNumber('')).toBe('');
  });
});

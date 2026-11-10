import { z } from 'zod';
import { configured, providerJson, ProviderError, toCents, type Fetcher } from './http';
export interface ShippingConfig {
  INTEGRATIONS_MODE: 'mock' | 'live';
  ME_ACCESS_TOKEN?: string;
  ME_SANDBOX: 'true' | 'false';
  ME_CLIENT_ID?: string;
  ME_CLIENT_SECRET?: string;
  ME_REDIRECT_URI?: string;
  EMAIL_REPLY_TO: string;
}
export interface QuoteProduct {
  id: string;
  quantity: number;
  weightGrams: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  insuranceCents: number;
}
export function createShipping(config: ShippingConfig, fetcher: Fetcher = fetch) {
  const host =
    config.ME_SANDBOX === 'true'
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';
  const request = <T>(
    path: string,
    accessToken: string,
    body?: unknown,
    method = body ? 'POST' : 'GET',
  ) =>
    providerJson<T>(
      'Melhor Envio',
      host + path,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `MaosEmOracao (${config.EMAIL_REPLY_TO})`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      fetcher,
    );
  return {
    authorizationUrl(state: string) {
      configured('Melhor Envio', config.ME_CLIENT_ID, config.ME_REDIRECT_URI);
      return (
        host +
        '/oauth/authorize?' +
        new URLSearchParams({
          client_id: config.ME_CLIENT_ID!,
          redirect_uri: config.ME_REDIRECT_URI!,
          response_type: 'code',
          scope:
            'shipping-calculate shipping-cancel shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-services shipping-tracking cart-read cart-write',
          state,
        })
      );
    },
    async token(input: { code: string } | { refreshToken: string }) {
      configured(
        'Melhor Envio',
        config.ME_CLIENT_ID,
        config.ME_CLIENT_SECRET,
        config.ME_REDIRECT_URI,
      );
      return z
        .object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number() })
        .parse(
          await providerJson(
            'Melhor Envio',
            host + '/oauth/token',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': `MaosEmOracao (${config.EMAIL_REPLY_TO})`,
              },
              body: JSON.stringify({
                client_id: config.ME_CLIENT_ID,
                client_secret: config.ME_CLIENT_SECRET,
                redirect_uri: config.ME_REDIRECT_URI,
                ...('code' in input
                  ? { grant_type: 'authorization_code', code: input.code }
                  : { grant_type: 'refresh_token', refresh_token: input.refreshToken }),
              }),
            },
            fetcher,
          ),
        );
    },
    async quotes(input: {
      originCep: string;
      cep: string;
      products: QuoteProduct[];
      accessToken?: string;
    }) {
      if (config.INTEGRATIONS_MODE === 'mock')
        return [
          {
            serviceId: 'mock-pac',
            label: 'Homologação · frete de teste',
            carrier: 'Transportadora de teste',
            cents: 1890,
            days: 5,
            data: { mock: true, products: input.products },
          },
        ];
      const credential = input.accessToken || config.ME_ACCESS_TOKEN;
      configured('Melhor Envio', credential);
      const result = z
        .array(
          z
            .object({
              id: z.union([z.number(), z.string()]),
              name: z.string().optional(),
              price: z.union([z.number(), z.string()]).optional(),
              custom_price: z.union([z.number(), z.string()]).optional(),
              delivery_time: z.number().optional(),
              custom_delivery_time: z.number().optional(),
              company: z.object({ name: z.string() }).optional(),
              error: z.string().optional(),
            })
            .passthrough(),
        )
        .parse(
          await request('/api/v2/me/shipment/calculate', credential!, {
            from: { postal_code: input.originCep.replace(/\D/g, '') },
            to: { postal_code: input.cep.replace(/\D/g, '') },
            products: input.products.map((p) => ({
              id: p.id,
              width: p.widthCm,
              height: p.heightCm,
              length: p.lengthCm,
              weight: p.weightGrams / 1000,
              insurance_value: p.insuranceCents / 100,
              quantity: p.quantity,
            })),
          }),
        );
      return result
        .filter((r) => !r.error && (r.custom_price !== undefined || r.price !== undefined))
        .filter(
          (r) =>
            !(
              Array.isArray(r.packages) &&
              r.packages.length > 1 &&
              (/correios|j&t|loggi/i.test(r.company?.name || '') || String(r.id) === '27')
            ) && !/azul/i.test(r.company?.name || ''),
        )
        .map((r) => ({
          serviceId: String(r.id),
          label: r.name || String(r.id),
          carrier: r.company?.name || '',
          cents: toCents(r.custom_price ?? r.price!),
          days: r.custom_delivery_time ?? r.delivery_time ?? 0,
          data: r,
        }));
    },
    async cart(payload: unknown, key: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock') return { id: 'mock-shipping-' + key };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      return z
        .object({ id: z.string() })
        .passthrough()
        .parse(await request('/api/v2/me/cart', (accessToken || config.ME_ACCESS_TOKEN)!, payload));
    },
    async checkout(id: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock') return { mock: true };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      return request('/api/v2/me/shipment/checkout', (accessToken || config.ME_ACCESS_TOKEN)!, {
        orders: [id],
      });
    },
    async generate(id: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock') return { mock: true };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      return request('/api/v2/me/shipment/generate', (accessToken || config.ME_ACCESS_TOKEN)!, {
        orders: [id],
      });
    },
    async label(id: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock')
        return { url: 'https://loja.example/etiqueta-de-homologacao' };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      return z.object({ url: z.url().refine((v) => new URL(v).protocol === 'https:') }).parse(
        await request('/api/v2/me/shipment/print', (accessToken || config.ME_ACCESS_TOKEN)!, {
          mode: 'public',
          orders: [id],
        }),
      );
    },
    async cancel(id: string, reason: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock') return { mock: true };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      return request('/api/v2/me/shipment/cancel', (accessToken || config.ME_ACCESS_TOKEN)!, {
        order: { id, reason_id: 2, description: reason },
      });
    },
    async tracking(id: string, accessToken?: string) {
      if (config.INTEGRATIONS_MODE === 'mock')
        return { state: 'posted', tracking: 'TESTE-SEM-ENVIO', carrier: 'Homologação' };
      configured('Melhor Envio', accessToken || config.ME_ACCESS_TOKEN);
      const raw = await request<
        Record<string, { status?: string; tracking?: string; company?: { name?: string } }>
      >('/api/v2/me/shipment/tracking', (accessToken || config.ME_ACCESS_TOKEN)!, { orders: [id] });
      const r = raw[id];
      if (!r) throw new ProviderError('Melhor Envio', 'INVALID_TRACKING');
      return {
        state: r.status || 'unknown',
        tracking: r.tracking || '',
        carrier: r.company?.name || '',
      };
    },
  };
}

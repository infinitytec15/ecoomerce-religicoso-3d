import { z } from 'zod';
import { ApiError, type CommerceGateway } from './contracts';
import {
  accountSchema,
  checkoutResultSchema,
  operationsSchema,
  prayerResponseSchema,
  sessionSchema,
  shippingResponseSchema,
} from './response-schemas';
import {
  checkoutSchema,
  loginSchema,
  newsletterSchema,
  prayerSchema,
  productSchema,
  publicSettingsSchema,
  subscriptionSchema,
  type LoginInput,
  type NewsletterInput,
  type PrayerInput,
} from '@/lib/domain/schemas';
import type {
  Address,
  AdminCommand,
  CatalogQuery,
  CheckoutInput,
  SubscribeInput,
  SubscriptionChange,
} from '@/lib/domain/types';
export class HttpClient {
  constructor(
    private baseUrl = '/api/v1',
    private fetcher: typeof fetch = fetch,
  ) {}
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const response = await this.fetcher(this.baseUrl.replace(/\/$/, '') + '/' + path, {
      method: options.method || 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).catch(() => {
      throw new ApiError(
        'NETWORK_ERROR',
        'Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.',
        503,
      );
    });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = z
        .object({
          error: z.object({
            code: z.string(),
            message: z.string(),
            details: z.record(z.string(), z.string()).optional(),
          }),
        })
        .safeParse(payload);
      throw new ApiError(
        error.success ? error.data.error.code : 'API_ERROR',
        error.success ? error.data.error.message : 'Não foi possível concluir a solicitação.',
        response.status,
        error.success ? error.data.error.details : undefined,
      );
    }
    const parsed = z.object({ data: schema }).safeParse(payload);
    if (!parsed.success)
      throw new ApiError(
        'INVALID_RESPONSE',
        'O serviço retornou uma resposta incompatível. Tente novamente.',
        502,
      );
    return parsed.data.data;
  }
}
const message = z.object({ message: z.string() }),
  voidSchema = z.unknown().transform(() => undefined);
export class HttpGateway implements CommerceGateway {
  readonly mode = 'http' as const;
  constructor(private client = new HttpClient(process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1')) {}
  catalog(query: CatalogQuery = {}) {
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    return this.client.request('catalog/products?' + params, z.array(productSchema));
  }
  product(id: string) {
    return this.client.request(
      'catalog/products/' + encodeURIComponent(id),
      productSchema.nullable(),
    );
  }
  settings() {
    return this.client.request('store/settings', publicSettingsSchema);
  }
  async session() {
    try {
      return await this.client.request('auth/session', sessionSchema.nullable());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }
  login(input: LoginInput) {
    return this.client.request('auth/login', sessionSchema, {
      method: 'POST',
      body: loginSchema.parse(input),
    });
  }
  logout() {
    return this.client.request('auth/logout', voidSchema, { method: 'POST', body: {} });
  }
  recover(email: string, kind: 'customer' | 'staff') {
    return this.client.request('auth/recover', message, { method: 'POST', body: { email, kind } });
  }
  account() {
    return this.client.request('account', accountSchema);
  }
  updateProfile(input: { name: string; email: string; address?: Address }) {
    return this.client.request('account/profile', voidSchema, { method: 'PATCH', body: input });
  }
  checkout(input: CheckoutInput) {
    return this.client.request('orders', checkoutResultSchema, {
      method: 'POST',
      body: checkoutSchema.parse(input),
      idempotencyKey: input.idempotencyKey,
    });
  }
  subscribe(input: SubscribeInput) {
    return this.client.request('subscriptions', checkoutResultSchema, {
      method: 'POST',
      body: subscriptionSchema.parse(input),
      idempotencyKey: input.idempotencyKey,
    });
  }
  async confirmDemoPayment() {
    throw new ApiError(
      'DEMO_ONLY',
      'A confirmação de pagamentos reais é feita pelo provedor no backend.',
      403,
    );
  }
  payment(id: string) {
    return this.client.request(
      'orders/' + encodeURIComponent(id) + '/payment',
      checkoutResultSchema,
    );
  }
  shipping(cep: string) {
    return this.client.request(
      'shipping/quotes?cep=' + encodeURIComponent(cep),
      shippingResponseSchema,
    );
  }
  changeSubscription(change: SubscriptionChange) {
    return this.client.request('subscriptions/' + encodeURIComponent(change.id), voidSchema, {
      method: 'PATCH',
      body: change,
    });
  }
  createTicket(input: {
    subject: string;
    category: string;
    message: string;
    name?: string;
    email?: string;
  }) {
    return this.client.request('support/tickets', voidSchema, { method: 'POST', body: input });
  }
  replyTicket(id: string, text: string) {
    return this.client.request(
      'support/tickets/' + encodeURIComponent(id) + '/messages',
      voidSchema,
      { method: 'POST', body: { message: text } },
    );
  }
  community() {
    return this.client.request('community/prayers', z.array(prayerResponseSchema));
  }
  postPrayer(input: PrayerInput) {
    return this.client.request('community/prayers', voidSchema, {
      method: 'POST',
      body: prayerSchema.parse(input),
    });
  }
  reactPrayer(id: string) {
    return this.client.request(
      'community/prayers/' + encodeURIComponent(id) + '/reaction',
      voidSchema,
      { method: 'POST', body: {} },
    );
  }
  deletePrayer(id: string) {
    return this.client.request('community/prayers/' + encodeURIComponent(id), voidSchema, {
      method: 'DELETE',
    });
  }
  newsletter(input: NewsletterInput) {
    return this.client.request('newsletter', message.extend({ token: z.string().optional() }), {
      method: 'POST',
      body: newsletterSchema.parse(input),
    });
  }
  unsubscribeNewsletter(token?: string) {
    return this.client.request('newsletter/unsubscribe', voidSchema, {
      method: 'POST',
      body: { token },
    });
  }
  admin() {
    return this.client.request('admin/operations', operationsSchema);
  }
  adminCommand(command: AdminCommand) {
    return this.client.request('admin/commands', voidSchema, { method: 'POST', body: command });
  }
}

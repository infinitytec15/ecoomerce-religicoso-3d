import type { LoginInput, NewsletterInput, PrayerInput } from '@/lib/domain/schemas';
import type {
  AccountSnapshot,
  AdminCommand,
  CatalogQuery,
  CheckoutInput,
  CheckoutResult,
  Operations,
  Prayer,
  Product,
  Session,
  ShippingQuote,
  StoreSettings,
  SubscribeInput,
  SubscriptionChange,
  Address,
} from '@/lib/domain/types';
export interface CommerceGateway {
  readonly mode: 'demo' | 'http';
  catalog(query?: CatalogQuery): Promise<Product[]>;
  product(id: string): Promise<Product | null>;
  settings(): Promise<StoreSettings>;
  session(): Promise<Session | null>;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<void>;
  recover(email: string, kind: 'customer' | 'staff'): Promise<{ message: string }>;
  account(): Promise<AccountSnapshot>;
  updateProfile(input: { name: string; email: string; address?: Address }): Promise<void>;
  checkout(input: CheckoutInput): Promise<CheckoutResult>;
  subscribe(input: SubscribeInput): Promise<CheckoutResult>;
  confirmDemoPayment(id: string): Promise<void>;
  payment(id: string): Promise<CheckoutResult>;
  shipping(
    cep: string,
    items?: { productId: string; quantity: number; sizeIndex?: number }[],
  ): Promise<ShippingQuote[]>;
  changeSubscription(change: SubscriptionChange): Promise<void>;
  createTicket(input: {
    subject: string;
    category: string;
    message: string;
    name?: string;
    email?: string;
  }): Promise<void>;
  replyTicket(id: string, message: string): Promise<void>;
  community(): Promise<Prayer[]>;
  postPrayer(input: PrayerInput): Promise<void>;
  reactPrayer(id: string): Promise<void>;
  deletePrayer(id: string): Promise<void>;
  reportPrayer(id: string, reason: string): Promise<void>;
  newsletter(input: NewsletterInput): Promise<{ message: string; token?: string }>;
  unsubscribeNewsletter(token?: string): Promise<void>;
  admin(): Promise<Operations>;
  adminCommand(command: AdminCommand, idempotencyKey?: string): Promise<void>;
  invitation(token: string): Promise<import('@/lib/domain/types').TeamInvitation>;
  acceptInvitation(input: { token: string; name: string; password?: string }): Promise<void>;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
export function requireValue<T>(
  value: T | null | undefined,
  message = 'Registro não encontrado.',
): T {
  if (value === undefined || value === null) throw new ApiError('NOT_FOUND', message, 404);
  return value;
}

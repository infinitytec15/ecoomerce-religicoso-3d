import type {
  ContactImportInput,
  GroupBuyPublic,
  MarketingContactRow,
  MarketingStatus,
  MyReview,
  ProductReviews,
  ReviewInput,
  Segment,
  StoryEvent,
  StoryHighlightPublic,
} from '@maos-em-oracao/contracts';
import type { LoginInput, NewsletterInput, PrayerInput } from '@/lib/domain/schemas';
import type {
  CartItem,
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
export interface CrmPreview {
  total: number;
  consent: number;
  legitimateInterest: number;
}
export interface CrmContactsQuery {
  q?: string;
  tag?: string;
  cursor?: string;
}
export interface CrmContactsPage {
  items: MarketingContactRow[];
  next?: string;
}
export interface CrmImportResult {
  created: number;
  updated: number;
  keptUnsubscribed: number;
}
export interface CommerceGateway {
  readonly mode: 'demo' | 'http';
  catalog(query?: CatalogQuery): Promise<Product[]>;
  product(id: string): Promise<Product | null>;
  /** Joinable group-buy campaigns. */
  groupBuys(): Promise<GroupBuyPublic[]>;
  groupBuy(id: string): Promise<GroupBuyPublic>;
  /** Active story highlights with their videos. */
  stories(): Promise<StoryHighlightPublic[]>;
  /** Fire-and-forget view/click counter; never rejects. */
  storyEvent(input: StoryEvent): Promise<void>;
  settings(): Promise<StoreSettings>;
  session(): Promise<Session | null>;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<void>;
  recover(email: string, kind: 'customer' | 'staff'): Promise<{ message: string }>;
  account(): Promise<AccountSnapshot>;
  updateProfile(input: { name: string; email: string; address?: Address }): Promise<void>;
  estimate(input: {
    items: CheckoutInput['items'];
    coupon: string;
    cep?: string;
    shippingQuoteId?: string;
    groupBuyId?: string;
  }): Promise<{
    items: CartItem[];
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    totalCents: number;
  }>;
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
  productReviews(productId: string, rating?: number): Promise<ProductReviews>;
  createReview(input: ReviewInput, idempotencyKey: string): Promise<MyReview>;
  /** The signed-in customer's e-mail marketing choice. */
  marketingStatus(): Promise<MarketingStatus>;
  setMarketing(subscribed: boolean): Promise<void>;
  /** Public unsubscribe link: the token comes from the e-mail. */
  marketingUnsubscribe(input: { token: string; campaignId?: string }): Promise<void>;
  /** Admin (marketing permission): audience size for a segment. */
  crmPreview(segment: Segment): Promise<CrmPreview>;
  /** Admin: contacts, 50 per page; pass the previous `next` as `cursor`. */
  crmContacts(query?: CrmContactsQuery): Promise<CrmContactsPage>;
  /** Admin: imports ONE chunk of rows (the caller splits large files). */
  crmImport(input: ContactImportInput): Promise<CrmImportResult>;
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

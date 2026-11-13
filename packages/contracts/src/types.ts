import type {
  ClubEdition,
  Coupon,
  PaymentToken,
  ProductMedia,
  ProductModel,
  ProductShipping,
  StockMovement,
  TeamInvitation,
  WorkspaceSettings,
} from './admin-types';
export type {
  MediaAsset,
  AssetKind,
  ProductMedia,
  ProductModel,
  ModelStats,
  WorkspaceSettings,
  TeamInvitation,
  ClubEdition,
  Coupon,
  RecordReference,
  RecordKind,
  PaymentToken,
  StockMovement,
  ProductShipping,
  ProductPackage,
  IntegrationHealth,
  ShippingRequest,
  UploadSession,
} from './admin-types';
export const collections = [
  'Católicos',
  'Evangélicos',
  'Cristãos',
  'Presentes',
  'Personalizados',
] as const;
export type Collection = (typeof collections)[number];
export type FaithProfile = 'Católica' | 'Evangélica' | 'Cristã';
export type PaymentMethod = 'card' | 'pix' | 'split';
export type OrderStatus =
  | 'Aguardando pagamento'
  | 'Confirmado'
  | 'Em produção'
  | 'Em acabamento'
  | 'Pronto para envio'
  | 'Enviado'
  | 'Entregue'
  | 'Cancelado';
export type SubscriptionStatus = 'Ativa' | 'Pausada' | 'Pagamento pendente' | 'Cancelada';
export type ChargeStatus = 'Pago' | 'Pendente' | 'Recusado' | 'Cancelada' | 'Estornado';
export type ProductionStage = 'Fila' | 'Impressão' | 'Acabamento' | 'Conferência' | 'Pronto';
export type Role = 'customer' | 'admin' | 'support' | 'production' | 'finance';
export type Permission =
  | 'orders'
  | 'subscriptions'
  | 'production'
  | 'shipping'
  | 'catalog'
  | 'customers'
  | 'finance'
  | 'support'
  | 'community'
  | 'marketing'
  | 'reports'
  | 'team'
  | 'settings';
export interface Session {
  guest?: boolean;
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  /** Store owner: the only one who can change settings. */
  owner?: boolean;
  demo: boolean;
}
export interface Product {
  id: string;
  name: string;
  description: string;
  category: Collection;
  tags: Collection[];
  priceCents: number;
  imageIndex: number;
  image: string;
  badge: string;
  sizes: string[];
  sizePrices?: number[];
  colors: string[];
  active: boolean;
  sku: string;
  stock: number;
  media?: ProductMedia[];
  model?: ProductModel | null;
  shipping?: ProductShipping;
  seoTitle?: string;
  seoDescription?: string;
  archived?: boolean;
}
/** Private production cost of one piece, in cents. costCents is their sum. */
export interface CostBreakdown {
  materialCents: number;
  packagingCents: number;
  energyCents: number;
  laborCents: number;
  otherCents: number;
}
export interface InventoryProduct extends Product {
  costCents: number;
  costBreakdown?: CostBreakdown;
  costBySize?: CostBreakdown[];
}
export interface Address {
  document?: string;
  name: string;
  email: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  extra: string;
  district: string;
  city: string;
  state: string;
}
export interface Customer extends Address {
  id: string;
  status: 'Ativo' | 'Inativo';
  created: string;
  notes: string;
}
export interface CartItem {
  key: string;
  productId: string;
  name: string;
  image: string;
  imageIndex: number;
  color: string;
  size: string;
  sizeIndex: number;
  unitCents: number;
  quantity: number;
  dedication: string;
}
export interface Order {
  id: string;
  number: string;
  customerId: string;
  subscriptionId?: string;
  type: 'Loja' | 'Clube';
  edition?: string;
  items: CartItem[];
  totalCents: number;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  status: OrderStatus;
  created: string;
  due: string;
  address: Address;
  chargeId: string;
  tracking: string;
  carrier: string;
  priority: 'Normal' | 'Alta';
  notes: string;
  sourceOrderId?: string;
  shippingServiceId?: string;
  shippingQuoteId?: string;
  labelStatus?: 'Não solicitada' | 'Preparada' | 'Gerada' | 'Cancelada';
  labelUrl?: string;
}
export interface Subscription {
  id: string;
  customerId: string;
  profile: FaithProfile;
  finish: string;
  priceCents: number;
  status: SubscriptionStatus;
  payment: 'card' | 'pix';
  created: string;
  nextRenewal: string;
  nextShipment: string;
  address: Address;
  history: { date: string; label: string }[];
}
export interface Charge {
  id: string;
  customerId: string;
  subscriptionId?: string;
  orderId: string;
  amountCents: number;
  method: PaymentMethod;
  status: ChargeStatus;
  due: string;
  paidAt?: string;
  description: string;
  cycle: string;
  pixCents: number;
  cardCents: number;
  installments: number;
  refundReason?: string;
}
export interface ProductionJob {
  id: string;
  orderId: string;
  stage: ProductionStage;
  printer: string;
  hours: number;
  assignee: string;
  priority: 'Normal' | 'Alta';
  due: string;
  notes?: string;
  material?: string;
  grams?: number;
  startedAt?: string;
  completedAt?: string;
}
export interface Printer {
  id: string;
  name: string;
  status: 'Disponível' | 'Imprimindo' | 'Manutenção';
  capacity: number;
}
export interface Expense {
  id: string;
  name: string;
  amountCents: number;
  category: string;
  date: string;
  status: 'Previsto' | 'Pago';
}
export interface TicketMessage {
  by: 'cliente' | 'equipe';
  text: string;
  date: string;
  internal?: boolean;
  attachments?: ProductMedia[];
}
export interface Ticket {
  id: string;
  customerId: string;
  subject: string;
  category: string;
  status: 'Aberto' | 'Em atendimento' | 'Resolvido';
  priority: 'Normal' | 'Alta';
  assignee: string;
  created: string;
  messages: TicketMessage[];
}
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'Ativo' | 'Inativo';
  permissions?: Permission[];
  lastSeen?: string;
}
export interface Prayer {
  id: string;
  name: string;
  title: string;
  message: string;
  category: string;
  anonymous: boolean;
  example: boolean;
  hidden: boolean;
  created: string;
  reactions: number;
  owned: boolean;
  prayed: boolean;
  moderation?: 'Publicado' | 'Em análise' | 'Oculto';
  reports?: { reason: string; date: string }[];
  moderationNote?: string;
}
export interface Campaign {
  id: string;
  subject: string;
  message: string;
  date: string;
  recipients: number;
  status: string;
  previewText?: string;
  scheduledAt?: string;
  audience?: 'Inscritos em oração' | 'Assinantes do clube';
}
export interface AuditEntry {
  id: string;
  date: string;
  actor: string;
  action: string;
  entity: string;
}
export interface StoreSettings {
  storeName: string;
  email: string;
  phone: string;
  clubName: string;
  priceCents: number;
  dispatchDay: number;
  edition: string;
  editionMonth: string;
  lowStock: number;
  profiles: Record<FaithProfile, string[]>;
}
export interface Operations {
  version: 2;
  products: InventoryProduct[];
  clients: Customer[];
  subscriptions: Subscription[];
  orders: Order[];
  charges: Charge[];
  jobs: ProductionJob[];
  printers: Printer[];
  expenses: Expense[];
  tickets: Ticket[];
  team: TeamMember[];
  settings: StoreSettings;
  campaigns: Campaign[];
  audit: AuditEntry[];
  prayers: Prayer[];
  newsletter: { name: string; email: string; subscribed: boolean } | null;
  processed: Record<string, { orderId: string; subscriptionId?: string }>;
  workspace: WorkspaceSettings;
  invitations: TeamInvitation[];
  editions: ClubEdition[];
  coupons: Coupon[];
  stockMovements: StockMovement[];
}
export interface AccountSnapshot {
  customer: Customer;
  subscriptions: Subscription[];
  orders: Order[];
  charges: Charge[];
  tickets: Ticket[];
}
export interface OrderItemInput {
  productId: string;
  quantity: number;
  color: string;
  sizeIndex: number;
  dedication: string;
}
export interface CheckoutInput {
  items: OrderItemInput[];
  address: Address;
  shipping: string;
  coupon: string;
  payment: PaymentMethod;
  pixCents: number;
  installments: number;
  consent: boolean;
  idempotencyKey: string;
  paymentToken?: PaymentToken;
  shippingQuoteId?: string;
  shippingServiceId?: string;
}
export interface SubscribeInput {
  profile: FaithProfile;
  finish: string;
  address: Address;
  payment: 'card' | 'pix';
  consent: boolean;
  idempotencyKey: string;
  paymentToken?: PaymentToken;
}
export type PaymentAction =
  | { type: 'challenge'; paymentId: string; externalResourceUrl: string; creq: string }
  | { type: 'none' }
  | { type: 'redirect'; url: string }
  | { type: 'pix'; qrCode: string; copyPaste: string; expiresAt: string };
export interface CheckoutResult {
  orderId: string;
  subscriptionId?: string;
  paymentAction: PaymentAction;
}
export interface ShippingQuote {
  id: string;
  label: string;
  cents: number;
  estimate: string;
  quoteId?: string;
  serviceId?: string;
  carrier?: string;
  expiresAt?: string;
}
export interface CatalogQuery {
  search?: string;
  category?: string;
  color?: string;
  maxCents?: number;
  sort?: string;
  occasion?: string;
}
export type AdminCommand =
  | { type: 'product.archive'; id: string }
  | { type: 'stock.adjust'; productId: string; delta: number; reason: string }
  | { type: 'orders.batch'; ids: string[]; action: 'priority' | 'cancel' | 'production' }
  | {
      type: 'production.update';
      id: string;
      printer: string;
      hours: number;
      assignee: string;
      due: string;
      priority: 'Normal' | 'Alta';
      notes: string;
      material: string;
      grams: number;
    }
  | { type: 'shipping.label'; id: string; action: 'prepare' | 'generate' | 'cancel' }
  | { type: 'edition.save'; edition: ClubEdition }
  | { type: 'edition.activate'; id: string }
  | { type: 'coupon.save'; coupon: Coupon }
  | { type: 'coupon.archive'; id: string }
  | {
      type: 'invite.create';
      name: string;
      email: string;
      role: Exclude<Role, 'customer'>;
      permissions: Permission[];
    }
  | { type: 'invite.revoke' | 'invite.resend'; id: string }
  | { type: 'workspace.save'; settings: WorkspaceSettings }
  | {
      type: 'prayer.review';
      id: string;
      status: 'Publicado' | 'Em análise' | 'Oculto';
      note: string;
    }
  | { type: 'campaign.save'; campaign: Campaign }
  | { type: 'campaign.action'; id: string; action: 'schedule' | 'cancel' | 'draft' }
  | { type: 'customer.save'; customer: Partial<Customer> & Pick<Customer, 'name' | 'email'> }
  | { type: 'customer.archive'; id: string }
  | { type: 'customer.delete'; id: string }
  | { type: 'order.delete'; id: string }
  | { type: 'product.save'; product: InventoryProduct }
  | {
      type: 'order.update';
      id: string;
      status: OrderStatus;
      priority: 'Normal' | 'Alta';
      due: string;
      notes: string;
    }
  | {
      type: 'order.create';
      customerId: string;
      productId: string;
      quantity: number;
      shippingCents: number;
      paid: boolean;
      due: string;
    }
  | { type: 'production.create'; orderId: string; printer: string; hours: number; assignee: string }
  | { type: 'production.advance'; id: string }
  | { type: 'printer.update'; id: string; status: Printer['status'] }
  | { type: 'shipping.dispatch'; id: string; tracking: string; carrier: string }
  | { type: 'shipping.deliver'; id: string }
  | { type: 'charge.pay'; id: string }
  | { type: 'charge.refund'; id: string; reason: string }
  | { type: 'expense.create'; expense: Omit<Expense, 'id'> }
  | { type: 'expense.pay'; id: string }
  | { type: 'subscription.renew'; id: string; result: 'Pago' | 'Pendente' | 'Recusado' }
  | { type: 'subscription.state'; id: string; status: SubscriptionStatus }
  | {
      type: 'ticket.reply';
      id: string;
      message: string;
      status: Ticket['status'];
      assignee: string;
      internal?: boolean;
      priority?: 'Normal' | 'Alta';
    }
  | { type: 'prayer.moderate'; id: string }
  | { type: 'campaign.create'; campaign: Pick<Campaign, 'subject' | 'message' | 'date'> }
  | { type: 'team.save'; member: TeamMember }
  | { type: 'settings.save'; settings: StoreSettings };
export interface SubscriptionChange {
  id: string;
  action: 'pause' | 'resume' | 'skip' | 'cancel' | 'preferences';
  reason?: string;
  profile?: FaithProfile;
  finish?: string;
  payment?: 'card' | 'pix';
  address?: Address;
}

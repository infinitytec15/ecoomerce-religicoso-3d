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
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
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
  colors: string[];
  active: boolean;
  sku: string;
  stock: number;
}
export interface InventoryProduct extends Product {
  costCents: number;
}
export interface Address {
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
}
export interface Campaign {
  id: string;
  subject: string;
  message: string;
  date: string;
  recipients: number;
  status: string;
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
  shipping: 'standard' | 'express';
  coupon: string;
  payment: PaymentMethod;
  pixCents: number;
  installments: number;
  consent: boolean;
  idempotencyKey: string;
}
export interface SubscribeInput {
  profile: FaithProfile;
  finish: string;
  address: Address;
  payment: 'card' | 'pix';
  consent: boolean;
  idempotencyKey: string;
}
export type PaymentAction =
  | { type: 'none' }
  | { type: 'redirect'; url: string }
  | { type: 'pix'; qrCode: string; copyPaste: string; expiresAt: string };
export interface CheckoutResult {
  orderId: string;
  subscriptionId?: string;
  paymentAction: PaymentAction;
}
export interface ShippingQuote {
  id: 'standard' | 'express';
  label: string;
  cents: number;
  estimate: string;
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
  | { type: 'customer.save'; customer: Partial<Customer> & Pick<Customer, 'name' | 'email'> }
  | { type: 'customer.archive'; id: string }
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

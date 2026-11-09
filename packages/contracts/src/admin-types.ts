import type { FaithProfile, Permission, Role } from './types';

export type AssetKind = 'image' | 'video' | 'model';
export interface ModelStats {
  triangles: number;
  meshes: number;
  dimensions: [number, number, number];
  unit: 'mm';
}
export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  size: number;
  storage: 'local' | 'bunny-storage' | 'bunny-stream';
  status: 'ready' | 'processing' | 'failed';
  created: string;
  url?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  stats?: ModelStats;
}
export interface ProductMedia {
  id: string;
  kind: 'image' | 'video';
  source: 'upload' | 'external' | 'youtube' | 'bunny-stream';
  assetId?: string;
  url?: string;
  alt: string;
  status?: 'ready' | 'processing' | 'failed';
}
export interface ProductModel {
  assetId: string;
  filename: string;
  format: 'stl' | '3mf';
  status: 'ready' | 'processing' | 'failed';
  previewUrl?: string;
  stats?: ModelStats;
}
export interface ProductShipping {
  weightGrams: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  leadTimeDays: number;
}
export interface StockMovement {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  date: string;
  actor: string;
}
export interface TeamInvitation {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, 'customer'>;
  permissions: Permission[];
  status: 'Pendente' | 'Aceito' | 'Revogado';
  token: string;
  created: string;
  expiresAt: string;
}
export interface ClubEdition {
  id: string;
  name: string;
  month: string;
  dispatchDay: number;
  status: 'Rascunho' | 'Programada' | 'Em produção' | 'Concluída';
  profiles: Record<FaithProfile, string[]>;
  message: string;
  notes: string;
}
export interface Coupon {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  amount: number;
  minimumCents: number;
  startsAt: string;
  endsAt: string;
  limit: number;
  used: number;
  active: boolean;
}
export interface WorkspaceSettings {
  legalName: string;
  document: string;
  supportHours: string;
  responseHours: number;
  originCep: string;
  originStreet: string;
  originNumber: string;
  originDistrict: string;
  originCity: string;
  originState: string;
  defaultWeightGrams: number;
  defaultWidthCm: number;
  defaultHeightCm: number;
  defaultLengthCm: number;
  productionDays: number;
  freeShippingAboveCents: number;
  inventoryPolicy: 'on-demand' | 'stock';
  contactName: string;
  privacyEmail: string;
  returnInstructions: string;
  storeDescription: string;
  reviewPrayers: boolean;
  prayerSenderName: string;
  prayerReplyTo: string;
  prayerSendHour: string;
  paymentProvider: 'mercado-pago';
  shippingProvider: 'melhor-envio';
  imageProvider: 'bunny-storage';
  videoProvider: 'bunny-stream';
  youtubeEnabled: boolean;
  notificationOrder: boolean;
  notificationLowStock: boolean;
  notificationTicket: boolean;
  lowStockEmails: string;
  ticketReplies: string[];
}
export interface IntegrationHealth {
  provider: 'mercado-pago' | 'melhor-envio' | 'bunny-storage' | 'bunny-stream' | 'email';
  status: 'demo' | 'not-configured' | 'ready' | 'error';
  checkedAt?: string;
  message: string;
}
export interface PaymentToken {
  token?: string;
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
  payer: { email: string; identification?: { type: string; number: string } };
}
export interface ShippingRequest {
  cep: string;
  items?: { productId: string; quantity: number }[];
}
export interface UploadSession {
  id: string;
  transport: 'proxy' | 'tus';
  url: string;
  headers?: Record<string, string>;
}
export type RecordKind =
  | 'order'
  | 'subscription'
  | 'customer'
  | 'production'
  | 'shipping'
  | 'product'
  | 'charge'
  | 'ticket'
  | 'prayer'
  | 'campaign'
  | 'edition'
  | 'member';
export interface RecordReference {
  kind: RecordKind;
  id: string;
}

export const defaultWorkspaceSettings: WorkspaceSettings = {
  legalName: 'Mãos em Oração',
  document: '',
  supportHours: 'Segunda a sexta, das 9h às 18h',
  responseHours: 24,
  originCep: '01001-000',
  originStreet: 'Rua Exemplo',
  originNumber: '123',
  originDistrict: 'Centro',
  originCity: 'São Paulo',
  originState: 'SP',
  defaultWeightGrams: 300,
  defaultWidthCm: 18,
  defaultHeightCm: 25,
  defaultLengthCm: 18,
  productionDays: 5,
  freeShippingAboveCents: 0,
  inventoryPolicy: 'on-demand',
  contactName: 'Equipe Mãos em Oração',
  privacyEmail: 'privacidade@maosemoracao.demo',
  returnInstructions: 'Entre em contato pelo atendimento antes de enviar sua peça.',
  storeDescription:
    'Peças cristãs em impressão 3D para acolher o lar e presentear com significado.',
  reviewPrayers: true,
  prayerSenderName: 'Mãos em Oração',
  prayerReplyTo: 'acolhimento@maosemoracao.demo',
  prayerSendHour: '07:00',
  paymentProvider: 'mercado-pago',
  shippingProvider: 'melhor-envio',
  imageProvider: 'bunny-storage',
  videoProvider: 'bunny-stream',
  youtubeEnabled: true,
  notificationOrder: true,
  notificationLowStock: true,
  notificationTicket: true,
  lowStockEmails: '',
  ticketReplies: [
    'Olá! Vamos acompanhar seu pedido com todo cuidado.',
    'Recebemos sua mensagem e já estamos verificando os detalhes.',
    'Sua solicitação foi resolvida. Seguimos por aqui se precisar.',
  ],
};

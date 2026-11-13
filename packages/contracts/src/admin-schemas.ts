import { z } from 'zod';
import { httpsUrlSchema } from './urls';
import { calculatorSettingsSchema } from './print-cost';
const publishedAssetUrl = z.union([
  httpsUrlSchema,
  z.string().regex(/^\/api\/media\/public\/[a-zA-Z0-9_-]+\/(image\.webp|preview\.glb|video)$/),
]);
export const permissionSchema = z.enum([
  'orders',
  'subscriptions',
  'production',
  'shipping',
  'catalog',
  'customers',
  'finance',
  'support',
  'community',
  'marketing',
  'reports',
  'team',
  'settings',
]);
export const modelStatsSchema = z.object({
  triangles: z.number().int().positive(),
  meshes: z.number().int().positive(),
  dimensions: z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
  ]),
  unit: z.literal('mm'),
});
export const productMediaSchema = z.object({
  status: z.enum(['ready', 'processing', 'failed']).optional(),
  id: z.string(),
  kind: z.enum(['image', 'video']),
  source: z.enum(['upload', 'external', 'youtube', 'bunny-stream']),
  assetId: z.string().optional(),
  url: z.string().optional(),
  alt: z.string().max(200),
});
export const productModelSchema = z.object({
  assetId: z.string(),
  filename: z.string(),
  format: z.enum(['stl', '3mf']),
  status: z.enum(['ready', 'processing', 'failed']),
  previewUrl: publishedAssetUrl.optional(),
  stats: modelStatsSchema.optional(),
});
const packageSchema = z.object({
  weightGrams: z.number().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  lengthCm: z.number().positive(),
});
export const productShippingSchema = packageSchema.extend({
  leadTimeDays: z.number().int().nonnegative(),
  /** Packed measures per size index; a missing entry falls back to the base measures. */
  bySize: z.array(packageSchema.nullable()).max(11).optional(),
});
export const editionSchema = z.object({
  id: z.string(),
  name: z.string().min(3),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dispatchDay: z.number().int().min(1).max(28),
  status: z.enum(['Rascunho', 'Programada', 'Em produção', 'Concluída']),
  profiles: z.object({
    Católica: z.array(z.string()).min(1),
    Evangélica: z.array(z.string()).min(1),
    Cristã: z.array(z.string()).min(1),
  }),
  message: z.string().max(2000),
  notes: z.string().max(2000),
});
export const invitationSchema = z.object({
  id: z.string(),
  name: z.string().min(3),
  email: z.email(),
  role: z.enum(['admin', 'support', 'production', 'finance']),
  permissions: z.array(permissionSchema),
  status: z.enum(['Pendente', 'Aceito', 'Revogado']),
  token: z.string(),
  created: z.string(),
  expiresAt: z.string(),
});
export const couponSchema = z
  .object({
    id: z.string(),
    code: z.string().min(3).max(40),
    kind: z.enum(['percent', 'fixed']),
    amount: z.number().int().positive(),
    minimumCents: z.number().int().nonnegative(),
    startsAt: z.string(),
    endsAt: z.string(),
    limit: z.number().int().positive(),
    used: z.number().int().nonnegative(),
    active: z.boolean(),
  })
  .refine(
    (c) => c.kind !== 'percent' || c.amount <= 100,
    'Desconto percentual deve ser de até 100%.',
  )
  .refine((c) => c.endsAt >= c.startsAt, 'A validade precisa ser posterior ao início.');
export const workspaceSchema = z.object({
  legalName: z.string().min(3),
  document: z.string().max(20),
  supportHours: z.string().min(3),
  responseHours: z.number().int().min(1).max(168),
  originCep: z.string().regex(/^\d{5}-?\d{3}$/),
  originStreet: z.string().min(2),
  originNumber: z.string().min(1),
  originDistrict: z.string().min(2),
  originCity: z.string().min(2),
  originState: z.string().length(2),
  defaultWeightGrams: z.number().positive(),
  defaultWidthCm: z.number().positive(),
  defaultHeightCm: z.number().positive(),
  defaultLengthCm: z.number().positive(),
  productionDays: z.number().int().nonnegative(),
  freeShippingAboveCents: z.number().int().nonnegative(),
  inventoryPolicy: z.enum(['on-demand', 'stock']),
  autoShippingLabel: z.boolean().optional(),
  dailyPrayerAuto: z.boolean().optional(),
  contactName: z.string().min(2),
  privacyEmail: z.email(),
  returnInstructions: z.string().min(10),
  storeDescription: z.string().min(10),
  reviewPrayers: z.boolean(),
  prayerSenderName: z.string().min(2),
  prayerReplyTo: z.email(),
  prayerSendHour: z.string().regex(/^\d{2}:\d{2}$/),
  paymentProvider: z.literal('mercado-pago'),
  shippingProvider: z.literal('melhor-envio'),
  imageProvider: z.literal('bunny-storage'),
  videoProvider: z.literal('bunny-stream'),
  youtubeEnabled: z.boolean(),
  notificationOrder: z.boolean(),
  notificationLowStock: z.boolean(),
  notificationTicket: z.boolean(),
  lowStockEmails: z.string(),
  ticketReplies: z.array(z.string().min(3)).max(10),
  costCalculator: calculatorSettingsSchema.optional(),
});
export const stockMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  delta: z.number().int(),
  reason: z.string().min(5),
  date: z.string(),
  actor: z.string(),
});
export const uploadSessionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  transport: z.enum(['proxy', 'tus']),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
});
export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['image', 'video', 'model']),
  mime: z.string(),
  size: z.number().int().positive(),
  storage: z.enum(['local', 'bunny-storage', 'bunny-stream']),
  status: z.enum(['ready', 'processing', 'failed']),
  created: z.string(),
  url: publishedAssetUrl.optional(),
  previewUrl: publishedAssetUrl.optional(),
  thumbnailUrl: publishedAssetUrl.optional(),
  stats: modelStatsSchema.optional(),
});

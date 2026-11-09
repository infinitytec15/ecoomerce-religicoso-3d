import { z } from 'zod';
export const addressSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  email: z.email('Informe um e-mail válido.').max(200),
  phone: z.string().min(10, 'Informe o telefone com DDD.').max(20),
  cep: z.string().regex(/^\d{5}-?\d{3}$/, 'Informe um CEP válido.'),
  street: z.string().trim().min(2),
  number: z.string().trim().min(1),
  extra: z.string().max(100).default(''),
  district: z.string().trim().min(2),
  city: z.string().trim().min(2),
  state: z.string().length(2),
});
export const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  color: z.string().min(1),
  sizeIndex: z.number().int().min(0).max(10),
  dedication: z.string().max(40).default(''),
});
export const checkoutSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(50),
  address: addressSchema,
  shipping: z.enum(['standard', 'express']),
  coupon: z.string().max(40),
  payment: z.enum(['card', 'pix', 'split']),
  pixCents: z.number().int().nonnegative(),
  installments: z.number().int().min(1).max(3),
  consent: z.literal(true, 'Confirme a simulação para continuar.'),
  idempotencyKey: z.string().uuid(),
});
export const subscriptionSchema = z.object({
  profile: z.enum(['Católica', 'Evangélica', 'Cristã']),
  finish: z.enum(['Marfim', 'Terracota', 'Surpresa']),
  address: addressSchema,
  payment: z.enum(['card', 'pix']),
  consent: z.literal(true, 'Confirme a assinatura para continuar.'),
  idempotencyKey: z.string().uuid(),
});
export const prayerSchema = z.object({
  name: z.string().trim().max(100),
  title: z.string().trim().min(5).max(100),
  message: z.string().trim().min(10).max(650),
  category: z.enum(['Família', 'Saúde', 'Gratidão', 'Direção', 'Fé', 'Trabalho']),
  anonymous: z.boolean(),
  consent: z.literal(true, 'Confirme antes de publicar.'),
});
export const newsletterSchema = z.object({
  name: z.string().trim().max(100).default(''),
  email: z.email().max(200),
  consent: z.literal(true),
});
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(4).max(200),
  kind: z.enum(['customer', 'staff']),
  name: z.string().max(100).optional(),
  register: z.boolean().optional(),
});
export const productSchema = z.object({
  id: z.string(),
  name: z.string().min(3),
  description: z.string().min(10),
  category: z.enum(['Católicos', 'Evangélicos', 'Cristãos', 'Presentes', 'Personalizados']),
  tags: z.array(z.enum(['Católicos', 'Evangélicos', 'Cristãos', 'Presentes', 'Personalizados'])),
  priceCents: z.number().int().positive(),
  imageIndex: z.number().int().min(0).max(5),
  image: z
    .string()
    .refine(
      (value) => /^\/(?!\/)/.test(value) || /^https:\/\//.test(value),
      'Use uma imagem local ou HTTPS.',
    ),
  badge: z.string(),
  sizes: z.array(z.string()).min(1),
  colors: z.array(z.string()).min(1),
  active: z.boolean(),
  sku: z.string(),
  stock: z.number().int().nonnegative(),
});
export const inventoryProductSchema = productSchema.extend({
  costCents: z.number().int().nonnegative(),
});
export const publicSettingsSchema = z.object({
  storeName: z.string(),
  email: z.string(),
  phone: z.string(),
  clubName: z.string(),
  priceCents: z.number().int().positive(),
  dispatchDay: z.number().int().min(1).max(28),
  edition: z.string(),
  editionMonth: z.string(),
  lowStock: z.number().int().nonnegative(),
  profiles: z.object({
    Católica: z.array(z.string()),
    Evangélica: z.array(z.string()),
    Cristã: z.array(z.string()),
  }),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type PrayerInput = z.infer<typeof prayerSchema>;
export type NewsletterInput = z.infer<typeof newsletterSchema>;
export const demoAddress = {
  name: 'Cliente de Demonstração',
  email: 'cliente@exemplo.com',
  phone: '11999990000',
  cep: '01001-000',
  street: 'Rua Exemplo',
  number: '123',
  extra: 'Apto 42',
  district: 'Centro',
  city: 'São Paulo',
  state: 'SP',
};

import { z } from 'zod';
const secret = z.string().min(32);
const schema = z.object({
  QUEUE_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,70}$/)
    .default('meo'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().startsWith('postgres'),
  REDIS_URL: z.string().startsWith('redis'),
  PUBLIC_WEB_URL: z.url(),
  PUBLIC_API_URL: z.url(),
  SESSION_SECRET: secret,
  BFF_SHARED_SECRET: secret,
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'Use 32 bytes em base64.'),
  INTEGRATIONS_MODE: z.enum(['mock', 'live']).default('live'),
  // Development only: homologate live payments before Melhor Envio is connected.
  SHIPPING_SIMULATED: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('meo_session'),
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  SPLIT_PAYMENT_ENABLED: z.enum(['true', 'false']).default('false'),
  ME_ACCESS_TOKEN: z.string().optional(),
  ME_CLIENT_ID: z.string().optional(),
  ME_CLIENT_SECRET: z.string().optional(),
  ME_REDIRECT_URI: z.url().optional(),
  ME_SANDBOX: z.enum(['true', 'false']).default('true'),
  BUNNY_STORAGE_ZONE: z.string().optional(),
  BUNNY_STORAGE_PASSWORD: z.string().optional(),
  BUNNY_STORAGE_HOST: z
    .enum([
      'storage.bunnycdn.com',
      'br.storage.bunnycdn.com',
      'ny.storage.bunnycdn.com',
      'la.storage.bunnycdn.com',
      'sg.storage.bunnycdn.com',
      'syd.storage.bunnycdn.com',
      'uk.storage.bunnycdn.com',
      'jh.storage.bunnycdn.com',
    ])
    .default('storage.bunnycdn.com'),
  BUNNY_PUBLIC_CDN_URL: z.url().optional(),
  BUNNY_PRIVATE_STORAGE_ZONE: z.string().optional(),
  BUNNY_PRIVATE_STORAGE_PASSWORD: z.string().optional(),
  BUNNY_STREAM_LIBRARY_ID: z.string().regex(/^\d+$/).optional(),
  BUNNY_STREAM_API_KEY: z.string().optional(),
  BUNNY_STREAM_READ_KEY: z.string().optional(),
  BUNNY_STREAM_CDN_HOST: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+$/)
    .optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.email().default('pedidos@loja.example'),
  EMAIL_REPLY_TO: z.email().default('ajuda@loja.example'),
  EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
  LOCAL_DATA_DIR: z.string().default('var/backend'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info']).default('info'),
});
export type BackendConfig = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const c = schema.parse(
    Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, value?.trim() === '' ? undefined : value]),
    ),
  );
  const web = new URL(c.PUBLIC_WEB_URL);
  if (c.NODE_ENV === 'production' && (c.INTEGRATIONS_MODE === 'mock' || web.protocol !== 'https:'))
    throw new Error('Produção exige HTTPS e integrações live.');
  if (c.NODE_ENV === 'production' && c.SHIPPING_SIMULATED === 'true')
    throw new Error('Frete simulado não é permitido em produção.');
  if (
    web.protocol !== 'https:' &&
    !(c.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(web.hostname))
  )
    throw new Error('PUBLIC_WEB_URL exige HTTPS, exceto loopback local.');
  return c;
}

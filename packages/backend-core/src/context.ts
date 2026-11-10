import { Redis } from 'ioredis';
import { createDatabase, type PrismaClient, type Transaction } from '@maos-em-oracao/database';
import { createPayments, createShipping, createMedia } from '@maos-em-oracao/integrations';
import type { StoreSettings, WorkspaceSettings } from '@maos-em-oracao/contracts';
import { loadConfig, type BackendConfig } from './config';
import { data, DomainError } from './shared';
export interface Context {
  config: BackendConfig;
  db: PrismaClient;
  redis: Redis;
  payments: ReturnType<typeof createPayments>;
  shipping: ReturnType<typeof createShipping>;
  media: ReturnType<typeof createMedia>;
}
export function createContext(config = loadConfig()): Context {
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  redis.on('error', () => {});
  return {
    config,
    db: createDatabase(config.DATABASE_URL),
    redis,
    payments: createPayments(config),
    shipping: createShipping(
      config.SHIPPING_SIMULATED === 'true' ? { ...config, INTEGRATIONS_MODE: 'mock' } : config,
    ),
    media: createMedia(config),
  };
}
export async function closeContext(ctx: Context) {
  await Promise.allSettled([ctx.db.$disconnect(), ctx.redis.quit()]);
}
export async function settings(db: PrismaClient | Transaction) {
  const rows = await db.appSetting.findMany({ where: { key: { in: ['store', 'workspace'] } } });
  const store = rows.find((r) => r.key === 'store'),
    workspace = rows.find((r) => r.key === 'workspace');
  if (!store || !workspace)
    throw new DomainError('SETUP_REQUIRED', 'Execute a configuração inicial da loja.', 503);
  return {
    store: data<StoreSettings>(store.data),
    workspace: data<WorkspaceSettings>(workspace.data),
  };
}
export async function rateLimit(ctx: Context, key: string, limit: number, windowMs: number) {
  const count = Number(
    await ctx.redis.eval(
      'local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("PEXPIRE",KEYS[1],ARGV[1]) end; return n',
      1,
      'meo:rate:' + key,
      windowMs,
    ),
  );
  if (count > limit)
    throw new DomainError(
      'RATE_LIMIT',
      'Muitas tentativas. Aguarde antes de tentar novamente.',
      429,
    );
}

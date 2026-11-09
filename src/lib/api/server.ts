import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { seedCatalog, seedSettings } from '@/lib/demo/seed';
import { productSchema, publicSettingsSchema } from '@/lib/domain/schemas';
import { IS_DEMO } from './config';
async function publicFetch<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error('Configure API_BASE_URL para usar o modo HTTP.');
  const response = await fetch(base.replace(/\/$/, '') + '/' + path, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60, tags: ['catalog'] },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Catálogo temporariamente indisponível.');
  return z.object({ data: schema }).parse(await response.json()).data;
}
export const getServerCatalog = cache(async () =>
  IS_DEMO ? seedCatalog : publicFetch('catalog/products', z.array(productSchema)),
);
export const getServerSettings = cache(async () =>
  IS_DEMO ? seedSettings : publicFetch('store/settings', publicSettingsSchema),
);
export const getServerProduct = cache(async (id: string) =>
  IS_DEMO
    ? seedCatalog.find((p) => p.id === id) || null
    : publicFetch('catalog/products/' + encodeURIComponent(id), productSchema.nullable()),
);

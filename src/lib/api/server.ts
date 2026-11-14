import 'server-only';
import { cache } from 'react';
import { connection } from 'next/server';
import { z } from 'zod';
import { groupBuyPublicSchema, productReviewsSchema } from '@maos-em-oracao/contracts';
import { seedCatalog, seedGroupBuys, seedSettings } from '@/lib/demo/seed';
import { joinableGroupBuys, publicGroupBuy } from '@/lib/domain/group-buys';
import { productSchema, publicSettingsSchema } from '@/lib/domain/schemas';
import { IS_DEMO } from './config';
async function publicFetch<T>(path: string, schema: z.ZodType<T>, missing?: T): Promise<T> {
  await connection();
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error('Configure API_BASE_URL para usar o modo HTTP.');
  const response = await fetch(base.replace(/\/$/, '') + '/' + path, {
    headers: {
      Accept: 'application/json',
      ...(process.env.BFF_SHARED_SECRET ? { 'x-bff-secret': process.env.BFF_SHARED_SECRET } : {}),
    },
    next: { revalidate: 60, tags: ['catalog'] },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404 && missing !== undefined) return missing;
  if (!response.ok) throw new Error('Catálogo temporariamente indisponível.');
  return z.object({ data: schema }).parse(await response.json()).data;
}
export const getServerCatalog = cache(async () =>
  IS_DEMO ? seedCatalog : publicFetch('catalog/products', z.array(productSchema)),
);
export const getServerSettings = cache(async () =>
  IS_DEMO ? seedSettings : publicFetch('store/settings', publicSettingsSchema),
);
/** Published reviews for JSON-LD; the demo has none server-side. */
export const getServerProductReviews = cache(async (id: string) =>
  IS_DEMO
    ? null
    : publicFetch(
        'catalog/products/' + encodeURIComponent(id) + '/reviews',
        productReviewsSchema,
      ).catch(() => null),
);
export const getServerProduct = cache(async (id: string) =>
  IS_DEMO
    ? seedCatalog.find((p) => p.id === id) || null
    : publicFetch('catalog/products/' + encodeURIComponent(id), productSchema.nullable()),
);
/** Joinable group-buy campaigns. */
export const getServerGroupBuys = cache(async () =>
  IS_DEMO
    ? joinableGroupBuys(seedGroupBuys).map(publicGroupBuy)
    : publicFetch('group-buys', z.array(groupBuyPublicSchema)),
);
/** One joinable campaign; null when it does not exist or is no longer joinable. */
export const getServerGroupBuy = cache(async (id: string) =>
  IS_DEMO
    ? (joinableGroupBuys(seedGroupBuys)
        .map(publicGroupBuy)
        .find((g) => g.id === id) ?? null)
    : publicFetch('group-buys/' + encodeURIComponent(id), groupBuyPublicSchema.nullable(), null),
);

import type { MetadataRoute } from 'next';
import { getServerCatalog, getServerGroupBuys } from '@/lib/api/server';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    [products, groupBuys] = await Promise.all([
      getServerCatalog(),
      getServerGroupBuys().catch(() => []),
    ]);
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: base + '/produtos', changeFrequency: 'weekly', priority: 0.9 },
    { url: base + '/clube', changeFrequency: 'monthly', priority: 0.8 },
    { url: base + '/compra-coletiva', changeFrequency: 'daily', priority: 0.7 },
    ...groupBuys.map((g) => ({
      url: base + '/compra-coletiva/' + g.id,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...products
      .filter((p) => p.active)
      .map((p) => ({
        url: base + '/produto/' + p.id,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
  ];
}

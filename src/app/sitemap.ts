import type { MetadataRoute } from 'next';
import { getServerCatalog } from '@/lib/api/server';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    products = await getServerCatalog();
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: base + '/produtos', changeFrequency: 'weekly', priority: 0.9 },
    { url: base + '/clube', changeFrequency: 'monthly', priority: 0.8 },
    ...products
      .filter((p) => p.active)
      .map((p) => ({
        url: base + '/produto/' + p.id,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
  ];
}

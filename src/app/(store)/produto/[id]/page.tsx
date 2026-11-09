import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/features/catalog/product-detail';
import { getServerProduct, getServerCatalog } from '@/lib/api/server';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const p = await getServerProduct((await params).id);
  return p
    ? {
        title: p.seoTitle || p.name,
        description: p.seoDescription || p.description,
        openGraph: {
          title: p.seoTitle || p.name,
          description: p.seoDescription || p.description,
          images: [p.image],
        },
      }
    : { title: 'Peça não encontrada' };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [p, products] = await Promise.all([
    getServerProduct((await params).id),
    getServerCatalog(),
  ]);
  if (!p || !p.active) notFound();
  return <ProductDetail initialProduct={p} initialCatalog={products} />;
}

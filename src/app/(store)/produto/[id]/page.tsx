import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/features/catalog/product-detail';
import { getServerProduct, getServerCatalog, getServerProductReviews } from '@/lib/api/server';
import { jsonLdScript, productJsonLd } from '@/lib/seo/product-json-ld';
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
  const { id } = await params,
    [p, products] = await Promise.all([getServerProduct(id), getServerCatalog()]);
  if (!p || !p.active) notFound();
  const reviews = p.rating?.count ? await getServerProductReviews(id) : null;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(productJsonLd(p, reviews?.reviews)),
        }}
      />
      <ProductDetail initialProduct={p} initialCatalog={products} />
    </>
  );
}

'use client';
import type { Product } from '@/lib/domain/types';
import { useCatalog } from '@/lib/api/query';
import { ProductCard } from './product-card';
export function ProductGrid({
  initialProducts,
  limit,
  exclude,
}: {
  initialProducts: Product[];
  limit?: number;
  exclude?: string;
}) {
  const { data = initialProducts } = useCatalog(initialProducts),
    items = data.filter((p) => p.active && p.id !== exclude).slice(0, limit);
  return (
    <div className="product-grid">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

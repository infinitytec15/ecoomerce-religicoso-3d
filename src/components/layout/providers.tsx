'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CommerceProvider } from '@/lib/api/query';
import { FeedbackProvider } from '@/components/ui/feedback';
import { useCartStore } from '@/lib/store/cart';
import { migrateLegacyCart, type LegacyCartItem } from '@/lib/domain/legacy-cart';
function LegacyAndCart() {
  const router = useRouter();
  useEffect(() => {
    const oldHash = location.hash;
    if (oldHash.startsWith('#/')) {
      let path = decodeURIComponent(oldHash.slice(1));
      path = path
        .replace(
          /^\/categoria\/(.+)$/,
          (m, category) => '/produtos?categoria=' + encodeURIComponent(category),
        )
        .replace(
          /^\/ocasiao\/(.+)$/,
          (m, occasion) => '/produtos?ocasiao=' + encodeURIComponent(occasion),
        )
        .replace(/^\/conta\/pedido-(.+)$/, '/conta/pedidos/$1')
        .replace(/^\/sucesso/, '/checkout/sucesso');
      if (path.startsWith('/') && !path.startsWith('//') && !path.includes('\\'))
        router.replace(path);
    }
    const hasCurrent = localStorage.getItem('meo-cart-v2');
    void useCartStore.persist.rehydrate().then(async () => {
      if (hasCurrent) return;
      try {
        const old = JSON.parse(localStorage.getItem('amago-cart') || '[]') as LegacyCartItem[];
        const { seedCatalog } = await import('@/lib/demo/seed');
        const items = migrateLegacyCart(old, seedCatalog);
        const favorites = JSON.parse(localStorage.getItem('amago-favs') || '[]') as string[];
        useCartStore.getState().importLegacy(items, favorites);
      } catch {
        /* Keep the legacy data untouched if it cannot be read. */
      }
    });
  }, [router]);
  return null;
}
export function Providers({ children }: { children: ReactNode }) {
  return (
    <CommerceProvider>
      <FeedbackProvider>
        <LegacyAndCart />
        {children}
      </FeedbackProvider>
    </CommerceProvider>
  );
}

import type { ReactNode } from 'react';
import { ShopFrame } from '@/components/layout/shop-frame';
import { Footer } from '@/components/layout/footer';
export default function StoreLayout({ children }: { children: ReactNode }) {
  return <ShopFrame footer={<Footer />}>{children}</ShopFrame>;
}

import type { ReactNode } from 'react';
import { ShopFrame } from '@/components/layout/shop-frame';
import { Footer } from '@/components/layout/footer';
import { STORE_LEGAL } from '@/lib/domain/store-legal';
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <ShopFrame footer={<Footer />} whatsapp={STORE_LEGAL.whatsapp}>
      {children}
    </ShopFrame>
  );
}

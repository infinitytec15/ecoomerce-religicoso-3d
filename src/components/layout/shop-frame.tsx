'use client';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { Header } from './header';
import { useCartStore } from '@/lib/store/cart';
import { useSession } from '@/lib/api/query';
const CartSheet = dynamic(() => import('@/features/cart/cart-sheet'), { ssr: false });
const FaithFeatures = dynamic(() => import('@/components/faith/faith-features'), { ssr: false });
export function ShopFrame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const pathname = usePathname(),
    compact = pathname.startsWith('/checkout') || pathname === '/clube/assinar',
    open = useCartStore((s) => s.isOpen),
    session = useSession();
  if (pathname.startsWith('/conta') && session.data?.role !== 'customer') return <>{children}</>;
  return (
    <>
      <Header compact={compact} />
      {children}
      {!compact && footer}
      {open && <CartSheet />}
      <FaithFeatures />
    </>
  );
}

'use client';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { Header } from './header';
import { useCartStore } from '@/lib/store/cart';
import { useSession } from '@/lib/api/query';
import { TrackingScripts } from '@/components/tracking/tracking-scripts';
import { CookieBanner } from '@/components/tracking/cookie-banner';
import { WhatsAppButton } from './whatsapp-button';
const CartSheet = dynamic(() => import('@/features/cart/cart-sheet'), { ssr: false });
const FaithFeatures = dynamic(() => import('@/components/faith/faith-features'), { ssr: false });
export function ShopFrame({
  children,
  footer,
  whatsapp,
}: {
  children: ReactNode;
  footer: ReactNode;
  /** Store phone that answers on WhatsApp. */
  whatsapp?: string;
}) {
  const pathname = usePathname(),
    compact = pathname.startsWith('/checkout') || pathname === '/clube/assinar',
    open = useCartStore((s) => s.isOpen),
    session = useSession();
  const tracking = (
    <>
      <TrackingScripts />
      <CookieBanner />
    </>
  );
  if (pathname.startsWith('/conta') && session.data?.role !== 'customer')
    return (
      <>
        {children}
        {tracking}
      </>
    );
  return (
    <>
      <Header compact={compact} />
      {children}
      {!compact && footer}
      {open && <CartSheet />}
      <FaithFeatures />
      {!compact && <WhatsAppButton phone={whatsapp} />}
      {tracking}
    </>
  );
}

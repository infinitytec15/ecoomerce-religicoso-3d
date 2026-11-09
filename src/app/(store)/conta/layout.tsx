import type { ReactNode } from 'react';
import { AccountFrame } from '@/features/account/account-frame';
export const metadata = { title: 'Minha conta', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}

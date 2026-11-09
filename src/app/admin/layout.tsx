import type { ReactNode } from 'react';
import { AdminFrame } from '@/features/admin/admin-frame';
export const metadata = {
  title: { default: 'Gestão', template: '%s · Gestão Mãos em Oração' },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}

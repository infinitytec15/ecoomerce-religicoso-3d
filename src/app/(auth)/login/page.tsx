import { AuthScreen } from '@/features/auth/auth-screen';
export const metadata = { title: 'Entrar', robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ retorno?: string }>;
}) {
  return <AuthScreen kind="customer" returnTo={(await searchParams).retorno} />;
}

'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEndSession, useSession } from '@/lib/api/query';
import { errorMessage } from '@/lib/api/contracts';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { Icon, type IconName } from '@/components/ui/icon';
import { AuthScreen } from '@/features/auth/auth-screen';
const nav: [string, string, IconName][] = [
  ['/conta', 'Meu espaço', 'user'],
  ['/conta/pedidos', 'Meus pedidos', 'box'],
  ['/conta/assinatura', 'Minha assinatura', 'gift'],
  ['/conta/envios', 'Envios do clube', 'truck'],
  ['/conta/cobrancas', 'Cobranças', 'card'],
  ['/conta/atendimentos', 'Atendimentos', 'chat'],
  ['/conta/enderecos', 'Endereços', 'pin'],
  ['/conta/dados', 'Meus dados', 'user'],
];
export function AccountFrame({ children }: { children: ReactNode }) {
  const session = useSession(),
    logout = useEndSession(),
    path = usePathname(),
    router = useRouter();
  if (session.isPending)
    return (
      <main id="main" className="container">
        <LoadingState />
      </main>
    );
  if (session.isError)
    return (
      <main id="main" className="container">
        <ErrorState message={errorMessage(session.error)} onRetry={() => void session.refetch()} />
      </main>
    );
  if (session.data?.role !== 'customer')
    return <AuthScreen key="customer" kind="customer" returnTo={path} />;
  return (
    <main id="main" className="container">
      <div className="account-layout">
        <aside className="account-side">
          <h2>Olá, {session.data.name.split(' ')[0]}.</h2>
          <p>Que bom ter você por aqui.</p>
          {nav.map(([href, label, icon]) => (
            <Link
              href={href}
              className={path === href ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
              key={href}
            >
              <Icon name={icon} />
              {label}
            </Link>
          ))}
          <Link href="/favoritos">
            <Icon name="heart" />
            Favoritos
          </Link>
          <button
            disabled={logout.isPending}
            onClick={async () => {
              await logout.mutateAsync();
              router.replace('/login');
            }}
          >
            <Icon name="logout" />
            Sair
          </button>
        </aside>
        <section className="account-content">{children}</section>
      </div>
    </main>
  );
}

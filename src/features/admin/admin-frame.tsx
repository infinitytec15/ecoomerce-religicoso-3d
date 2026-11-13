'use client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { RecordWorkspace } from './record-drawer';
import { usePathname, useRouter } from 'next/navigation';
import { useEndSession, useOperations, useSession } from '@/lib/api/query';
import type { Operations, Permission } from '@/lib/domain/types';
import { errorMessage } from '@/lib/api/contracts';
import { IS_DEMO } from '@/lib/api/config';
import { AuthScreen } from '@/features/auth/auth-screen';
import { Logo } from '@/components/layout/logo';
import { Icon, type IconName } from '@/components/ui/icon';
import { LoadingState, ErrorState } from '@/components/ui/states';
import { DevCredit } from '@/components/layout/dev-credit';
import { useNotify } from '@/components/ui/feedback';
export const adminNavigation: [string, string, IconName, Permission?][] = [
  ['', 'Visão geral', 'spark'],
  ['pedidos', 'Pedidos', 'bag', 'orders'],
  ['assinaturas', 'Assinaturas', 'gift', 'subscriptions'],
  ['producao', 'Produção', 'box', 'production'],
  ['expedicao', 'Expedição', 'truck', 'shipping'],
  ['produtos', 'Produtos e estoque', 'box', 'catalog'],
  ['calculadora', 'Calculadora de custos', 'split', 'catalog'],
  ['edicoes', 'Edições do clube', 'gift', 'subscriptions'],
  ['clientes', 'Clientes', 'user', 'customers'],
  ['financeiro', 'Financeiro', 'card', 'finance'],
  ['suporte', 'Atendimentos', 'chat', 'support'],
  ['comunidade', 'Mural de orações', 'heart', 'community'],
  ['avaliacoes', 'Avaliações', 'spark', 'community'],
  ['marketing', 'Oração diária', 'mail', 'marketing'],
  ['relatorios', 'Relatórios', 'filter', 'reports'],
  ['equipe', 'Equipe e perfis', 'user', 'team'],
  ['configuracoes', 'Configurações', 'filter', 'settings'],
];
const AdminDataContext = createContext<Operations | null>(null);
export function useAdminData() {
  const value = useContext(AdminDataContext);
  if (!value) throw new Error('AdminDataContext ausente.');
  return value;
}
export function AdminFrame({ children }: { children: ReactNode }) {
  const path = usePathname(),
    section = path.split('/')[2] || '',
    session = useSession(),
    operations = useOperations(),
    logout = useEndSession(),
    router = useRouter(),
    notify = useNotify();
  async function handleLogout() {
    try {
      await logout.mutateAsync();
      router.replace('/admin/login');
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.input = 'keyboard';
    };
    const pointer = () => {
      document.documentElement.dataset.input = 'pointer';
    };
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, []);
  if (section === 'login') return <>{children}</>;
  if (session.isPending)
    return (
      <main id="main" className="container">
        <LoadingState label="Preparando a gestão…" />
      </main>
    );
  if (session.isError)
    return (
      <main id="main" className="container">
        <ErrorState message={errorMessage(session.error)} onRetry={() => void session.refetch()} />
      </main>
    );
  if (!session.data || session.data.role === 'customer')
    return <AuthScreen key="staff" kind="staff" returnTo={path} />;
  const user = session.data,
    allowed = (permission?: Permission) => !permission || user.permissions.includes(permission),
    required = adminNavigation.find(([id]) => id === section)?.[3],
    data = operations.data,
    ticketCount = data?.tickets.filter((t) => t.status !== 'Resolvido').length || 0,
    chargeCount =
      data?.charges.filter((c) => ['Pendente', 'Recusado'].includes(c.status)).length || 0,
    alerts = ticketCount + chargeCount;
  return (
    <div className="admin-mode">
      <div className="admin-app">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <Logo />
            <span>gestão</span>
            <button
              className="admin-mobile-logout"
              disabled={logout.isPending}
              onClick={handleLogout}
            >
              <Icon name="logout" />
              <span>Sair da gestão</span>
            </button>
          </div>
          <nav aria-label="Administração">
            {adminNavigation
              .filter(([, , , permission]) => allowed(permission))
              .map(([id, label, icon]) => (
                <Link
                  key={id}
                  href={'/admin' + (id ? '/' + id : '')}
                  className={section === id ? 'active' : ''}
                  aria-current={section === id ? 'page' : undefined}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                  {id === 'suporte' && ticketCount > 0 && <small>{ticketCount}</small>}
                </Link>
              ))}
          </nav>
          <div className="admin-sidebar-bottom">
            <Link href="/">
              <Icon name="arrow" />
              Voltar para a loja
            </Link>
            <button
              className="admin-session-end"
              disabled={logout.isPending}
              onClick={handleLogout}
            >
              <Icon name="logout" />
              Sair da gestão
            </button>
            {IS_DEMO && (
              <p>
                Ambiente de demonstração
                <br />
                sem acesso a operações reais
              </p>
            )}
            <DevCredit />
          </div>
        </aside>
        <div className="admin-workspace">
          <header className="admin-topbar">
            <span>{adminNavigation.find(([id]) => id === section)?.[1] || 'Operação'}</span>
            <form
              className="admin-global-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(
                  '/admin/busca?q=' +
                    encodeURIComponent(String(new FormData(e.currentTarget).get('query') || '')),
                );
              }}
            >
              <Icon name="search" />
              <input
                name="query"
                placeholder="Buscar cliente, pedido ou assinatura"
                aria-label="Busca geral do administrador"
              />
              <button className="icon-btn" aria-label="Buscar na operação">
                <Icon name="arrow" />
              </button>
            </form>
            <div className="admin-topbar-actions">
              {IS_DEMO && <span className="admin-demo-badge">Dados demonstrativos</span>}
              <details className="admin-notifications">
                <summary aria-label="Abrir pendências">
                  <Icon name="chat" />
                  <small>{alerts}</small>
                </summary>
                <div>
                  <h3>Precisam de atenção</h3>
                  {allowed('finance') && (
                    <Link href="/admin/financeiro">{chargeCount} cobranças pendentes</Link>
                  )}
                  {allowed('support') && (
                    <Link href="/admin/suporte">{ticketCount} atendimentos abertos</Link>
                  )}
                  {allowed('production') && (
                    <Link href="/admin/producao">
                      {data?.jobs.filter((j) => j.stage !== 'Pronto').length || 0} ordens na
                      produção
                    </Link>
                  )}
                </div>
              </details>
              <Link className="admin-avatar" href="/admin/equipe" aria-label="Equipe da operação">
                {user.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </Link>
            </div>
          </header>
          <main id="main" className="admin-main">
            {!allowed(required) ? (
              <ErrorState message="Seu perfil não tem permissão para acessar esta área." />
            ) : operations.isPending ? (
              <LoadingState label="Carregando os registros da operação…" />
            ) : operations.isError || !data ? (
              <ErrorState
                message={errorMessage(operations.error)}
                onRetry={() => void operations.refetch()}
              />
            ) : (
              <AdminDataContext.Provider value={data}>
                <RecordWorkspace key={path}>{children}</RecordWorkspace>
              </AdminDataContext.Provider>
            )}
          </main>
          <footer className="admin-footnote">
            Mãos em Oração ·{' '}
            {IS_DEMO
              ? 'painel de demonstração local · pagamentos, envios, permissões e mensagens são simulados.'
              : 'gestão da loja e do clube mensal.'}
          </footer>
        </div>
      </div>
    </div>
  );
}

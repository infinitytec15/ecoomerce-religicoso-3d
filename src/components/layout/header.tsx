'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from './logo';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { useCartStore } from '@/lib/store/cart';
import { useUiStore } from '@/lib/store/ui';
import { useSession } from '@/lib/api/query';
import { collections } from '@/lib/domain/types';
import { IS_DEMO } from '@/lib/api/config';
export function Header({ compact = false }: { compact?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false),
    cart = useCartStore((s) => s.items),
    favorites = useCartStore((s) => s.favorites),
    setCartOpen = useCartStore((s) => s.setOpen),
    setNewsletter = useUiStore((s) => s.setNewsletterOpen),
    session = useSession(),
    router = useRouter(),
    count = cart.reduce((a, x) => a + x.quantity, 0);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMenuOpen(false);
    router.push('/produtos?busca=' + encodeURIComponent(String(data.get('search') || '')));
  }
  if (compact)
    return (
      <header className="checkout-head">
        <div className="container">
          <Logo />
          <span className="secure">
            <Icon name="lock" />
            {IS_DEMO ? 'Checkout demonstrativo' : 'Checkout'}
          </span>
        </div>
      </header>
    );
  return (
    <>
      <div className="announcement">
        <div className="container row between">
          <span>
            Fé para viver.{' '}
            <button className="announcement-prayer" onClick={() => setNewsletter(true)}>
              Receba uma oração diária grátis <Icon name="mail" />
            </button>
          </span>
          {IS_DEMO && <span className="demo">Demonstração · compras e valores ilustrativos</span>}
        </div>
      </div>
      <header className="header">
        <div className="container header-main">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <Logo />
          <form className="search" role="search" onSubmit={search}>
            <Icon name="search" />
            <input
              type="search"
              name="search"
              placeholder="Encontre uma peça com significado"
              aria-label="Buscar produtos"
            />
          </form>
          <div className="header-actions">
            <Link className="icon-btn" href="/favoritos" aria-label="Favoritos">
              <Icon name="heart" />
              {favorites.length > 0 && <span className="count">{favorites.length}</span>}
            </Link>
            <Link
              className="account-link"
              href={session.data && session.data.role !== 'customer' ? '/admin' : '/conta'}
              aria-label="Minha conta"
            >
              <Icon name="user" />
              <span>
                {session.data ? 'Olá, ' + session.data.name.split(' ')[0] : 'Minha conta'}
              </span>
            </Link>
            <button
              id="header-cart-button"
              className="icon-btn"
              aria-label={`Abrir carrinho com ${count} itens`}
              onClick={() => setCartOpen(true)}
            >
              <Icon name="bag" />
              {count > 0 && <span className="count">{count}</span>}
            </button>
          </div>
        </div>
        <div className="header-nav">
          <div className="container nav-inner">
            <nav className="nav-links" aria-label="Menu principal">
              <Link href="/produtos">Todos os produtos</Link>
              {collections.map((c) => (
                <Link
                  key={c}
                  className={c === 'Personalizados' ? 'special' : ''}
                  href={'/produtos?categoria=' + encodeURIComponent(c)}
                >
                  {c}
                </Link>
              ))}
              <Link className="community-link" href="/cantinho-da-fe">
                <Icon name="heart" />
                Cantinho da Fé
              </Link>
              <Link className="club-nav" href="/clube">
                <Icon name="gift" />
                Clube mensal
              </Link>
            </nav>
            <Link className="nav-right" href="/suporte">
              <Icon name="chat" />
              Precisa de ajuda?
            </Link>
          </div>
        </div>
      </header>
      <Modal
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title="Explore a loja"
        className="cart-sheet"
      >
        <nav className="drawer-content stack" aria-label="Menu da loja">
          <form className="row" onSubmit={search}>
            <input
              name="search"
              type="search"
              placeholder="Buscar uma peça"
              aria-label="Buscar uma peça"
            />
            <button className="icon-btn" aria-label="Buscar">
              <Icon name="search" />
            </button>
          </form>
          {['Todos', ...collections].map((c) => (
            <Link
              key={c}
              className="arrow-link"
              onClick={() => setMenuOpen(false)}
              href={c === 'Todos' ? '/produtos' : '/produtos?categoria=' + encodeURIComponent(c)}
            >
              {c === 'Todos' ? 'Todos os produtos' : c}
              <Icon name="arrow" />
            </Link>
          ))}
          {[
            ['/clube', 'Clube Cesta com Jesus'],
            ['/cantinho-da-fe', 'Cantinho da Fé'],
            ['/conta/pedidos', 'Meus pedidos'],
            ['/suporte', 'Suporte'],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
      </Modal>
    </>
  );
}

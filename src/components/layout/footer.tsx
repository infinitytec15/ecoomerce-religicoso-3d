import Link from 'next/link';
import { Logo } from './logo';
import { Icon } from '@/components/ui/icon';
import { PrayerInvite } from './prayer-invite';
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p>
              A fé nos aproxima. O amor dá forma. Peças cristãs para acolher seu lar e tocar o
              coração de quem você ama.
            </p>
            <PrayerInvite />
          </div>
          <div>
            <h3>Explore a loja</h3>
            <Link href="/produtos">Todos os produtos</Link>
            <Link href="/produtos?categoria=Cat%C3%B3licos">Coleção católica</Link>
            <Link href="/produtos?categoria=Evang%C3%A9licos">Coleção evangélica</Link>
            <Link href="/produtos?categoria=Personalizados">Personalizados</Link>
          </div>
          <div>
            <h3>Estamos por aqui</h3>
            <Link href="/suporte">Central de ajuda</Link>
            <Link href="/suporte/entrega">Frete e entrega</Link>
            <Link href="/suporte/trocas">Trocas e devoluções</Link>
            <Link href="/suporte/cuidados">Cuidados com as peças</Link>
          </div>
          <div>
            <h3>Seu espaço</h3>
            <Link href="/conta">Minha conta</Link>
            <Link href="/conta/pedidos">Meus pedidos</Link>
            <Link href="/favoritos">Meus favoritos</Link>
            <Link href="/suporte/privacidade">Privacidade e dados</Link>
            <Link href="/clube">Clube Cesta com Jesus</Link>
            <Link href="/admin">Painel administrador</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Mãos em Oração · Imagens conceituais geradas por IA.
          </span>
          <span>
            Pix <Icon name="pix" /> · Cartão <Icon name="card" /> · Pagamento combinado{' '}
            <Icon name="split" />
          </span>
        </div>
      </div>
    </footer>
  );
}

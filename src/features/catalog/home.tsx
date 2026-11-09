import Image from 'next/image';
import Link from 'next/link';
import type { Product, StoreSettings } from '@/lib/domain/types';
import { Icon, type IconName } from '@/components/ui/icon';
import { ButtonLink } from '@/components/ui/button';
import { ProductImage } from '@/components/ui/product-image';
import { ProductGrid } from './product-grid';
import { HomeClubBanner } from '@/features/club/home-club-banner';
export function Services() {
  return (
    <div className="service-strip">
      {(
        [
          ['box', 'Peças feitas por impressão 3D'],
          ['spark', 'Personalize com seu significado'],
          ['split', 'Pix, cartão ou os dois juntos'],
          ['truck', 'Calcule a entrega no seu CEP'],
        ] as [IconName, string][]
      ).map(([icon, text]) => (
        <div key={icon}>
          <Icon name={icon} />
          {text}
        </div>
      ))}
    </div>
  );
}
export function Home({ products, settings }: { products: Product[]; settings: StoreSettings }) {
  return (
    <main id="main" className="faith-home">
      <section className="faith-hero container">
        <div className="faith-hero-copy">
          <h1>
            A fé faz
            <br />
            <em>morada.</em>
          </h1>
          <p>
            Na sua casa. No seu dia. No presente que abraça.
            <br /> Peças cristãs em 3D para deixar a fé sempre por perto.
          </p>
          <div className="faith-hero-actions">
            <ButtonLink href="/produtos">
              Encontre sua peça de fé <Icon name="arrow" />
            </ButtonLink>
            <Link href="/produtos?categoria=Presentes" className="faith-secondary">
              Quero presentear <Icon name="gift" />
            </Link>
          </div>
          <div className="faith-hero-note">
            <Icon name="heart" />
            Para lembrar de Deus nos pequenos detalhes.
          </div>
        </div>
        <div className="faith-scene">
          <Image
            src="/assets/faith-home.webp"
            alt="Mãos sobre uma Bíblia aberta, uma cruz e a palavra Fé em uma mesa iluminada pelo sol. Cena conceitual."
            fill
            sizes="(max-width:760px) 100vw, 58vw"
            preload
          />
          <Link className="scene-note" href="/produto/cruz-essencial">
            <span className="scene-note-icon">
              <Icon name="cross" />
            </span>
            <span>
              Um cantinho para estar com Deus.<small>Conheça a Cruz Essencial</small>
            </span>
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="faith-seal">
          <Icon name="heart" />
          feito para
          <br />
          tocar o<br />
          <strong>coração</strong>
        </div>
      </section>
      <div className="faith-ribbon">
        <div className="container">
          {(
            [
              ['cross', 'Fé que acolhe'],
              ['heart', 'Amor em cada gesto'],
              ['gift', 'Presentes com propósito'],
              ['leaf', 'Esperança para o dia a dia'],
            ] as [IconName, string][]
          ).map(([icon, text]) => (
            <span key={icon}>
              <Icon name={icon} />
              {text}
            </span>
          ))}
        </div>
      </div>
      <section className="container faith-collections">
        <div className="section-header">
          <div>
            <h2>
              O que alimenta <em>a sua fé?</em>
            </h2>
            <p>Caminhos de devoção. O mesmo amor por Cristo.</p>
          </div>
          <Link className="arrow-link" href="/produtos">
            Explorar a loja <Icon name="arrow" />
          </Link>
        </div>
        <div className="devotion-grid">
          <Link className="devotion-card catholic" href="/produtos?categoria=Cat%C3%B3licos">
            <div className="devotion-text">
              <h3>
                Devoção
                <br />
                que acolhe.
              </h3>
              <span>
                Peças católicas <Icon name="arrow" />
              </span>
            </div>
            <ProductImage
              src="/assets/products/nossa-senhora.webp"
              alt="Nossa Senhora da Graça em marfim"
            />
          </Link>
          <Link className="devotion-card evangelical" href="/produtos?categoria=Evang%C3%A9licos">
            <div className="devotion-text">
              <h3>
                A Palavra
                <br />
                por perto.
              </h3>
              <span>
                Peças evangélicas <Icon name="arrow" />
              </span>
            </div>
            <ProductImage src="/assets/products/biblia-viva.webp" alt="Bíblia Viva em marfim" />
          </Link>
          <Link className="devotion-card personal" href="/produtos?categoria=Personalizados">
            <div className="devotion-text">
              <h3>
                Sua história.
                <br />
                Seu significado.
              </h3>
              <span>
                Personalize seu presente <Icon name="arrow" />
              </span>
            </div>
            <ProductImage src="/assets/products/palavra-fe.webp" alt="Palavra Fé em terracota" />
          </Link>
        </div>
      </section>
      <HomeClubBanner initialSettings={settings} />
      <section className="container faith-featured">
        <div className="section-header">
          <div>
            <h2>
              Pequenos lembretes
              <br />
              de um <em>amor maior.</em>
            </h2>
            <p>Para cultivar a fé na rotina e compartilhar o que vem do coração.</p>
          </div>
          <Link className="arrow-link" href="/produtos">
            Ver todas as peças <Icon name="arrow" />
          </Link>
        </div>
        <ProductGrid initialProducts={products} limit={4} />
      </section>
      <section className="faith-verse">
        <div className="container">
          <span className="verse-mark" aria-hidden="true">
            <Icon name="heart" />
          </span>
          <blockquote>
            “Façam tudo
            <br />
            com <em>amor.</em>”
          </blockquote>
          <a
            href="https://www.biblegateway.com/passage/?search=1+Cor%C3%ADntios+16%3A14&version=NVI-PT"
            target="_blank"
            rel="noreferrer"
          >
            1 Coríntios 16:14 · NVI <Icon name="arrow" />
          </a>
          <p>É esse o sentido de um presente escolhido com o coração.</p>
        </div>
      </section>
      <section className="container faith-occasions">
        <div className="section-header">
          <div>
            <h2>
              A fé acompanha
              <br />
              <em>cada novo capítulo.</em>
            </h2>
            <p>Uma lembrança de amor para os momentos que ficam.</p>
          </div>
        </div>
        <div className="occasion-links">
          {(
            [
              ['oracao', 'cross', 'Meu cantinho de oração', 'Um encontro com Deus, todos os dias.'],
              ['batismo', 'leaf', 'Batismo e novos começos', 'Uma lembrança de fé e acolhimento.'],
              [
                'casamento',
                'heart',
                'Casamento e família',
                'Para o lar que nasce e o amor que cresce.',
              ],
              ['presentear', 'gift', 'Um presente de coração', 'Para quem caminha na fé com você.'],
            ] as [string, IconName, string, string][]
          ).map(([id, icon, title, description]) => (
            <Link href={'/produtos?ocasiao=' + id} key={id}>
              <Icon name={icon} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      </section>
      <section className="container faith-personalize">
        <div className="personalize-art">
          <ProductImage src="/assets/products/palavra-fe.webp" alt="Palavra Fé em terracota" />
          <span className="gift-note">
            Para a vovó,
            <br />
            com todo o meu amor.<span>Uma dedicatória. Um abraço.</span>
          </span>
        </div>
        <div className="personalize-copy">
          <h2>
            Tem presente
            <br />
            que é <em>oração.</em>
          </h2>
          <p>A cor que ela ama. Um tamanho para aquele cantinho. Uma dedicatória só de vocês.</p>
          <p>Crie uma lembrança para expressar o que nem sempre cabe em palavras.</p>
          <ButtonLink href="/produtos?categoria=Personalizados" variant="light">
            Dar meu toque pessoal <Icon name="arrow" />
          </ButtonLink>
          <small>Escolha cor, tamanho e dedicatória na embalagem.</small>
        </div>
      </section>
      <div className="container">
        <Services />
      </div>
    </main>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import type { CatalogQuery, Product } from '@/lib/domain/types';
import { collections } from '@/lib/domain/types';
import { filterProducts, occasions } from '@/lib/domain/catalog';
import { useCatalog } from '@/lib/api/query';
import { useCartStore } from '@/lib/store/cart';
import { money } from '@/lib/domain/format';
import { ProductCard } from './product-card';
import { Icon } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
const categoryContent: Record<string, { title: string; description: string; image: string }> = {
  Católicos: {
    title: 'A devoção mora nos detalhes.',
    description:
      'Imagens sacras e símbolos para o seu cantinho de oração. Pequenas presenças que acolhem a fé.',
    image: 'nossa-senhora',
  },
  Evangélicos: {
    title: 'A Palavra inspira. A fé transforma.',
    description: 'Cruzes, símbolos e palavras para lembrar do amor de Cristo em cada novo dia.',
    image: 'biblia-viva',
  },
  Cristãos: {
    title: 'Uma só fé. Muitos significados.',
    description:
      'A cruz, a paz, a esperança. Símbolos cristãos para estar perto do que sustenta você.',
    image: 'cruz-essencial',
  },
  Presentes: {
    title: 'Tem amor que vira presente.',
    description: 'Para agradecer, celebrar ou simplesmente dizer: você está nas minhas orações.',
    image: 'sagrada-familia',
  },
  Personalizados: {
    title: 'Sua fé. Seu toque. Seu presente.',
    description:
      'Escolha cor, tamanho e uma dedicatória na embalagem. Faça sua lembrança carregar um pouco da sua história.',
    image: 'palavra-fe',
  },
};
export function CatalogView({
  initialProducts,
  query = {},
  favoritesOnly = false,
}: {
  initialProducts: Product[];
  query?: CatalogQuery;
  favoritesOnly?: boolean;
}) {
  const result = useCatalog(initialProducts),
    products = result.data || initialProducts,
    favorites = useCartStore((s) => s.favorites),
    router = useRouter(),
    [mobileFilters, setMobileFilters] = useState(false);
  const filtered = favoritesOnly
      ? products.filter((p) => p.active && favorites.includes(p.id))
      : filterProducts(products, query),
    content = categoryContent[query.category || ''] || {
      title: 'A fé faz parte da sua casa.',
      description: 'Objetos cristãos para viver a devoção, acolher o lar e presentear com amor.',
      image: 'cruz-essencial',
    },
    occasion = occasions[query.occasion || ''];
  function update(values: Partial<CatalogQuery>) {
    const next = { ...query, ...values },
      params = new URLSearchParams();
    for (const [key, value] of Object.entries(next))
      if (value !== undefined && value !== '' && value !== 'Todos')
        params.set(
          {
            search: 'busca',
            category: 'categoria',
            color: 'cor',
            maxCents: 'preco',
            sort: 'ordem',
            occasion: 'ocasiao',
          }[key] || key,
          String(value),
        );
    router.push('/produtos' + (params.size ? '?' + params : ''));
  }
  return (
    <main id="main" className="container catalog-page">
      <nav className="breadcrumb" aria-label="Você está aqui">
        <Link href="/">Início</Link>
        <Icon name="chevron" />
        <span>{favoritesOnly ? 'Favoritos' : query.category || 'Produtos'}</span>
      </nav>
      {favoritesOnly || query.search ? (
        <div className="catalog-title">
          <div>
            <h1>{favoritesOnly ? 'Seu lugar de guardar.' : `Busca por “${query.search}”`}</h1>
            <p>
              {favoritesOnly
                ? 'As peças que tocaram o seu coração.'
                : 'Encontre um significado especial para levar com você.'}
            </p>
          </div>
        </div>
      ) : (
        <section
          className={`faith-category ${query.category === 'Personalizados' ? 'category-personal' : query.category === 'Evangélicos' ? 'category-evangelical' : ''}`}
        >
          <div className="faith-category-copy">
            <h1>{occasion?.title || content.title}</h1>
            <p>{occasion?.description || content.description}</p>
            <div className="category-message">
              <Icon name={query.category === 'Personalizados' ? 'gift' : 'heart'} />
              {query.category === 'Personalizados'
                ? 'Uma dedicatória pode dizer tanto.'
                : 'Para a sua caminhada. Para quem caminha com você.'}
            </div>
          </div>
          <div className="category-photo">
            <ProductImage
              src={`/assets/products/${content.image}.webp`}
              alt="Peça conceitual da coleção"
              sizes="30vw"
            />
          </div>
        </section>
      )}
      <div className="catalog-layout">
        {!favoritesOnly && (
          <aside
            className={`catalog-side ${mobileFilters ? 'open' : ''}`}
            id="catalog-side"
            aria-label="Filtrar produtos"
          >
            <div className="filter-group">
              <h3>Coleções</h3>
              {['Todos', ...collections].map((c) => (
                <label className="filter-option" key={c}>
                  <input
                    type="radio"
                    name="category"
                    value={c}
                    checked={(query.category || 'Todos') === c}
                    onChange={() => update({ category: c, occasion: undefined })}
                  />
                  {c}
                  <span className="muted">
                    {
                      products.filter(
                        (p) =>
                          p.active && (c === 'Todos' || p.tags.includes(c as Product['category'])),
                      ).length
                    }
                  </span>
                </label>
              ))}
            </div>
            <div className="filter-group">
              <h3>Cor da peça</h3>
              {['Todos', 'Marfim', 'Areia', 'Terracota'].map((c) => (
                <label className="filter-option" key={c}>
                  <input
                    type="radio"
                    name="color"
                    checked={(query.color || 'Todos') === c}
                    onChange={() => update({ color: c })}
                  />
                  {c}
                </label>
              ))}
            </div>
            <div className="filter-group">
              <h3>Até {money(query.maxCents || 25000)}</h3>
              <input
                key={query.maxCents || 25000}
                type="range"
                min="5000"
                max="50000"
                step="1000"
                defaultValue={query.maxCents || 25000}
                onPointerUp={(e) => update({ maxCents: Number(e.currentTarget.value) })}
                onKeyUp={(e) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
                    update({ maxCents: Number(e.currentTarget.value) });
                }}
                aria-label="Preço máximo"
              />
            </div>
            <Button variant="text" onClick={() => router.push('/produtos')}>
              Limpar filtros
            </Button>
          </aside>
        )}
        <div style={favoritesOnly ? { gridColumn: '1/-1' } : undefined}>
          <div className="catalog-toolbar">
            <span className="muted">
              {filtered.length} {filtered.length === 1 ? 'peça encontrada' : 'peças encontradas'}
            </span>
            {!favoritesOnly && (
              <>
                <Button
                  variant="secondary"
                  className="small mobile-filter"
                  aria-expanded={mobileFilters}
                  aria-controls="catalog-side"
                  onClick={() => setMobileFilters(!mobileFilters)}
                >
                  <Icon name="filter" />
                  Filtros
                </Button>
                <form
                  className="catalog-search-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    update({ search: String(new FormData(e.currentTarget).get('search') || '') });
                  }}
                >
                  <input
                    key={query.search}
                    type="search"
                    name="search"
                    defaultValue={query.search || ''}
                    placeholder="Buscar peça"
                    aria-label="Buscar no catálogo"
                  />
                  <button className="icon-btn" aria-label="Buscar">
                    <Icon name="search" />
                  </button>
                </form>
                <select
                  aria-label="Ordenar produtos"
                  value={query.sort || 'featured'}
                  onChange={(e) => update({ sort: e.target.value })}
                >
                  <option value="featured">Em destaque</option>
                  <option value="low">Menor preço</option>
                  <option value="high">Maior preço</option>
                  <option value="name">Nome: A a Z</option>
                </select>
              </>
            )}
          </div>
          {result.isError ? (
            <ErrorState
              message="Não foi possível atualizar o catálogo."
              onRetry={() => void result.refetch()}
            />
          ) : filtered.length ? (
            <div className="product-grid">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={favoritesOnly ? 'Guarde o que toca você.' : 'Nenhuma peça por aqui.'}
              description={
                favoritesOnly
                  ? 'Toque no coração de uma peça para encontrá-la aqui depois.'
                  : 'Tente outro termo ou remova os filtros para encontrar sua peça.'
              }
              icon={favoritesOnly ? 'heart' : 'search'}
              action={
                <ButtonLink href="/produtos">
                  {favoritesOnly ? 'Explorar produtos' : 'Limpar filtros'}
                </ButtonLink>
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}

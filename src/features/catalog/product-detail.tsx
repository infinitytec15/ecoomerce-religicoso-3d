'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Product, ShippingQuote } from '@/lib/domain/types';
import { colorHex, money } from '@/lib/domain/format';
import { cartLine } from '@/lib/domain/commerce';
import { useCatalog, useGateway } from '@/lib/api/query';
import { useCartStore } from '@/lib/store/cart';
import { IS_DEMO } from '@/lib/api/config';
import { ProductGallery } from './product-media';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Form, text } from '@/components/ui/form';
import { ProductGrid } from './product-grid';
import { useNotify } from '@/components/ui/feedback';
const ProductViewer = dynamic(() => import('@/features/viewer/product-viewer'), { ssr: false });
export function ProductDetail({
  initialProduct,
  initialCatalog,
}: {
  initialProduct: Product;
  initialCatalog: Product[];
}) {
  const { data = initialCatalog } = useCatalog(initialCatalog),
    p = data.find((p) => p.id === initialProduct.id) || initialProduct,
    [color, setColor] = useState(p.colors[0]),
    [size, setSize] = useState(0),
    [quantity, setQuantity] = useState(1),
    [dedication, setDedication] = useState(''),
    [viewer, setViewer] = useState(false),
    [rates, setRates] = useState<ShippingQuote[]>([]),
    gateway = useGateway(),
    add = useCartStore((s) => s.add),
    openCart = useCartStore((s) => s.setOpen),
    router = useRouter(),
    notify = useNotify(),
    price = p.priceCents + size * 2000;
  function buy(immediate = false) {
    add(cartLine(p, quantity, color, size, dedication));
    if (immediate) router.push('/checkout');
    else openCart(true);
    notify('Peça adicionada ao carrinho.');
  }
  return (
    <main id="main" className="container page-top">
      <nav className="breadcrumb" aria-label="Você está aqui">
        <Link href="/">Início</Link>
        <Icon name="chevron" />
        <Link href="/produtos">Produtos</Link>
        <Icon name="chevron" />
        <span>{p.name}</span>
      </nav>
      <section className="product-detail">
        <ProductGallery product={p} onView3D={() => setViewer(true)} />
        <div className="detail-copy">
          <h1>{p.name}</h1>
          <span className="badge olive" style={{ marginBottom: 18 }}>
            {p.category} · {p.badge}
          </span>
          <p>{p.description}</p>
          <div className="detail-price">{money(price)}</div>
          <small>
            ou 3× de {money(Math.round(price / 3))} sem juros
            {IS_DEMO ? ' · valores ilustrativos' : ''}
          </small>
          <div className="detail-options">
            <div>
              <span className="option-label">
                Cor: <strong>{color}</strong>
              </span>
              <div className="color-buttons">
                {p.colors.map((c) => (
                  <button
                    className={`color-button ${color === c ? 'selected' : ''}`}
                    key={c}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                  >
                    <i style={{ background: colorHex(c) }} />
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Tamanho
              <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {p.sizes.map((s, i) => (
                  <option key={s} value={i}>
                    {s}
                    {i ? ' (+ ' + money(i * 2000) + ')' : ''}
                  </option>
                ))}
              </select>
            </label>
            {p.tags.includes('Personalizados') && (
              <label>
                Dedicatória na embalagem{' '}
                <span className="muted">(opcional, até 40 caracteres)</span>
                <input
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  maxLength={40}
                  placeholder="Ex.: Com amor, para a vovó"
                />
              </label>
            )}
            <div className="buy-row">
              <div className="quantity">
                <button
                  aria-label="Diminuir quantidade"
                  disabled={quantity === 1}
                  onClick={() => setQuantity(quantity - 1)}
                >
                  −
                </button>
                <span>{quantity}</span>
                <button
                  aria-label="Aumentar quantidade"
                  disabled={quantity === 10}
                  onClick={() => setQuantity(quantity + 1)}
                >
                  +
                </button>
              </div>
              <Button className="full" onClick={() => buy()}>
                <Icon name="bag" />
                Adicionar ao carrinho
              </Button>
            </div>
            <Button variant="secondary" className="full" onClick={() => buy(true)}>
              Comprar agora <Icon name="arrow" />
            </Button>
          </div>
          <div className="shipping-box">
            <Form
              onSubmit={async (d) =>
                setRates(
                  await gateway.shipping(text(d, 'cep'), [
                    { productId: p.id, quantity, sizeIndex: size },
                  ]),
                )
              }
            >
              <label htmlFor="product-cep">
                <Icon name="truck" />
                Calcule o frete e o prazo
              </label>
              <div className="row">
                <input
                  id="product-cep"
                  name="cep"
                  placeholder="00000-000"
                  required
                  pattern="[0-9]{5}-?[0-9]{3}"
                  maxLength={9}
                  aria-label="CEP para calcular frete"
                />
                <Button variant="secondary" className="small">
                  Calcular
                </Button>
              </div>
              <div className="shipping-result" aria-live="polite">
                {rates.map((r) => (
                  <p key={r.id}>
                    {r.label}: <strong>{money(r.cents)}</strong> · {r.estimate}
                  </p>
                ))}
                {rates.length > 0 && IS_DEMO && (
                  <small>Estimativa demonstrativa, sem cotação de transportadora.</small>
                )}
              </div>
            </Form>
          </div>
          <div className="details-list">
            <details open>
              <summary>Sobre a peça</summary>
              <p>
                Conceito em PLA com acabamento fosco e textura de camadas. Base incluída. Tamanho
                selecionado: {p.sizes[size]}. Produção sob encomenda
                {IS_DEMO ? ' simulada neste protótipo' : ''}.
              </p>
            </details>
            <details>
              <summary>Cuidados e conservação</summary>
              <p>
                Limpe com pano macio e seco. Evite calor intenso, sol direto e umidade. Peça
                decorativa; mantenha fora do alcance de crianças pequenas.
              </p>
            </details>
            <details>
              <summary>Personalização e entrega</summary>
              <p>
                Escolha cor e tamanho antes de adicionar.{' '}
                {IS_DEMO
                  ? 'Prazos e fretes são demonstrativos e incluem uma estimativa de produção. Nenhuma encomenda real será gerada.'
                  : 'Consulte prazos e opções de entrega no checkout.'}
              </p>
            </details>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-header">
          <h2>Outras formas de sentir.</h2>
          <Link className="arrow-link" href="/produtos">
            Explorar todas <Icon name="arrow" />
          </Link>
        </div>
        <ProductGrid initialProducts={initialCatalog} exclude={p.id} limit={4} />
      </section>
      {viewer && <ProductViewer product={p} color={color} open={viewer} onOpenChange={setViewer} />}
    </main>
  );
}

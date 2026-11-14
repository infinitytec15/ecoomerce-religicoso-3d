'use client';
import Link from 'next/link';
import { KitItems } from '@/components/commerce/kit-items';
import { Modal } from '@/components/ui/modal';
import { Button, ButtonLink } from '@/components/ui/button';
import { ProductImage } from '@/components/ui/product-image';
import { EmptyState } from '@/components/ui/states';
import { Icon } from '@/components/ui/icon';
import { useCartStore } from '@/lib/store/cart';
import { money } from '@/lib/domain/format';
export default function CartSheet() {
  const items = useCartStore((s) => s.items),
    open = useCartStore((s) => s.isOpen),
    setOpen = useCartStore((s) => s.setOpen),
    change = useCartStore((s) => s.change),
    remove = useCartStore((s) => s.remove),
    subtotal = items.reduce((a, x) => a + x.unitCents * x.quantity, 0);
  return (
    <Modal open={open} onOpenChange={setOpen} title="Seu carrinho" className="cart-sheet">
      <div className="drawer-content">
        {items.length ? (
          items.map((item) => (
            <article className="cart-item" key={item.key}>
              <ProductImage src={item.image} alt={item.name} sizes="100px" />
              <div>
                <Link href={'/produto/' + item.productId} onClick={() => setOpen(false)}>
                  <h3>{item.name}</h3>
                </Link>
                {item.kit ? (
                  <KitItems kit={item.kit} />
                ) : (
                  <small>
                    {item.color} · {item.size}
                  </small>
                )}
                {item.dedication && <small>“{item.dedication}”</small>}
                <strong>{money(item.unitCents * item.quantity)}</strong>
                <div className="row between">
                  <div className="quantity">
                    <button
                      aria-label={'Diminuir quantidade de ' + item.name}
                      onClick={() => change(item.key, item.quantity - 1)}
                      disabled={item.quantity === 1}
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label={'Aumentar quantidade de ' + item.name}
                      onClick={() => change(item.key, item.quantity + 1)}
                      disabled={item.quantity === 10}
                    >
                      +
                    </button>
                  </div>
                  <button className="text-btn" onClick={() => remove(item.key)}>
                    Remover
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="Há espaço para um significado."
            description="Escolha uma peça para trazer a fé para perto."
            action={
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Continuar explorando
              </Button>
            }
          />
        )}
      </div>
      {items.length > 0 && (
        <div className="drawer-footer">
          <div className="money-line total">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '13px 0 20px' }}>
            Frete e descontos calculados no próximo passo.
          </p>
          <Link className="btn full" href="/checkout" onClick={() => setOpen(false)}>
            Continuar para o checkout <Icon name="arrow" />
          </Link>
          <Button variant="text" className="full" onClick={() => setOpen(false)}>
            Continuar escolhendo
          </Button>
        </div>
      )}
    </Modal>
  );
}
export function CartPage() {
  const items = useCartStore((s) => s.items),
    setOpen = useCartStore((s) => s.setOpen);
  return (
    <main id="main" className="container">
      <div className="support-title">
        <h1>Suas escolhas, com significado.</h1>
        <p>Revise as peças antes de continuar.</p>
      </div>
      {items.length ? (
        <>
          <div className="stack">
            {items.map((item) => (
              <div className="cart-item" key={item.key}>
                <ProductImage src={item.image} alt={item.name} sizes="100px" />
                <div>
                  <h3>{item.name}</h3>
                  {item.kit ? (
                    <>
                      <KitItems kit={item.kit} />
                      <small>{item.quantity} un.</small>
                    </>
                  ) : (
                    <small>
                      {item.color} · {item.size} · {item.quantity} un.
                    </small>
                  )}
                  <strong>{money(item.unitCents * item.quantity)}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="row wrap" style={{ marginTop: 25 }}>
            <Button onClick={() => setOpen(true)}>Editar carrinho</Button>
            <ButtonLink href="/checkout">Ir para o checkout</ButtonLink>
          </div>
        </>
      ) : (
        <EmptyState
          title="Seu carrinho está começando."
          description="Encontre a próxima peça que vai fazer parte da sua história."
          action={<ButtonLink href="/produtos">Explorar peças</ButtonLink>}
        />
      )}
    </main>
  );
}

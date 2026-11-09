'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useCommand, useCommunity } from '@/lib/api/query';
import { IS_DEMO } from '@/lib/api/config';
import { errorMessage } from '@/lib/api/contracts';
import { dateLabel } from '@/lib/domain/format';
import type { Prayer } from '@/lib/domain/types';
import type { PrayerInput } from '@/lib/domain/schemas';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Form, text } from '@/components/ui/form';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useUiStore } from '@/lib/store/ui';
import { useNotify } from '@/components/ui/feedback';
const categories = ['Família', 'Saúde', 'Gratidão', 'Direção', 'Fé', 'Trabalho'] as const;
export function PrayerCard({ prayer: p }: { prayer: Prayer }) {
  const react = useCommand((g, id: string) => g.reactPrayer(id)),
    remove = useCommand((g, id: string) => g.deletePrayer(id));
  return (
    <article className="prayer-card">
      <h3>{p.title}</h3>
      <div className="row between">
        <span className="prayer-category">
          <Icon name={p.category === 'Gratidão' ? 'spark' : 'heart'} />
          {p.category}
        </span>
        <span className="prayer-card-date">
          {p.example ? 'Exemplo ilustrativo' : dateLabel(p.created)}
        </span>
      </div>
      <p>{p.message}</p>
      <div className="prayer-author">
        <Icon name="user" />
        {p.anonymous ? 'Pedido anônimo' : p.name || 'Alguém em oração'}
      </div>
      <div className="prayer-card-actions">
        <button
          className={`praying-button ${p.prayed ? 'active' : ''}`}
          disabled={react.isPending}
          aria-pressed={p.prayed}
          onClick={() => react.mutate(p.id)}
        >
          <Icon name="heart" />
          {p.prayed ? 'Estou orando por você' : 'Vou orar por você'}
          <span>{p.reactions}</span>
        </button>
        {p.owned && (
          <Button variant="text" loading={remove.isPending} onClick={() => remove.mutate(p.id)}>
            Remover meu pedido
          </Button>
        )}
      </div>
      {(react.isError || remove.isError) && (
        <p className="form-error" role="alert">
          {errorMessage(react.error || remove.error)}
        </p>
      )}
    </article>
  );
}
export function CommunityView() {
  const feed = useCommunity(),
    [category, setCategory] = useState('Todos'),
    [message, setMessage] = useState(''),
    [anonymous, setAnonymous] = useState(true),
    post = useCommand((g, input: PrayerInput) => g.postPrayer(input)),
    nameRef = useRef<HTMLInputElement>(null),
    openNewsletter = useUiStore((s) => s.setNewsletterOpen),
    notify = useNotify(),
    list = (feed.data || []).filter((p) => category === 'Todos' || p.category === category);
  function focusComposer() {
    nameRef.current?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    nameRef.current?.focus({ preventScroll: true });
  }
  return (
    <main id="main" className="container community-page">
      <nav className="breadcrumb" aria-label="Você está aqui">
        <Link href="/">Início</Link>
        <Icon name="chevron" />
        <span>Cantinho da Fé</span>
      </nav>
      <section className="community-hero">
        <div>
          <h1>
            Ninguém precisa
            <br />
            <em>caminhar sozinho.</em>
          </h1>
          <p>
            Um cantinho para deixar sua oração, compartilhar gratidão e acolher a caminhada de
            alguém. Aqui, a fé também é encontro.
          </p>
          <div className="row wrap">
            <Button onClick={focusComposer}>
              Quero pedir uma oração <Icon name="heart" />
            </Button>
            <Button variant="text" onClick={() => openNewsletter(true)}>
              Receber oração diária grátis <Icon name="mail" />
            </Button>
          </div>
        </div>
        <div className="community-hero-note">
          <Icon name="heart" />
          <p>
            Seu pedido importa.
            <br />
            Sua oração pode acolher alguém.
          </p>
          <span>{IS_DEMO ? 'Mural de demonstração' : 'Cantinho da Fé'}</span>
        </div>
      </section>
      {IS_DEMO && (
        <div className="notice community-demo">
          Este é o protótipo de um mural público. Os pedidos e as interações ficam apenas neste
          navegador e não são publicados na internet.
        </div>
      )}
      <div className="community-layout">
        <section className="prayer-wall" aria-label="Mural de pedidos de oração">
          <div className="section-header">
            <div>
              <h2>Vamos orar uns pelos outros.</h2>
              <p>
                {list.length}{' '}
                {list.length === 1 ? 'pedido neste cantinho' : 'pedidos neste cantinho'} · exemplos
                identificados
              </p>
            </div>
          </div>
          <div className="prayer-filters" role="group" aria-label="Filtrar pedidos">
            {['Todos', ...categories].map((c) => (
              <button
                className={`chip ${category === c ? 'active' : ''}`}
                aria-pressed={category === c}
                key={c}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="prayer-posts">
            {feed.isPending ? (
              <LoadingState label="Acolhendo os pedidos…" />
            ) : feed.isError ? (
              <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} />
            ) : list.length ? (
              list.map((p) => <PrayerCard prayer={p} key={p.id} />)
            ) : (
              <EmptyState
                icon="heart"
                title="Este espaço está aberto para acolher."
                description="Ainda não há pedidos nesta categoria. Você pode compartilhar o primeiro."
                action={
                  <Button variant="secondary" onClick={focusComposer}>
                    Escrever meu pedido
                  </Button>
                }
              />
            )}
          </div>
        </section>
        <aside className="prayer-compose">
          <h2>O que está no seu coração?</h2>
          <p>
            Escreva seu pedido com carinho. Evite nomes completos, contatos ou dados pessoais de
            outras pessoas.
          </p>
          <Form
            onSubmit={async (d, form) => {
              await post.mutateAsync({
                name: text(d, 'name'),
                title: text(d, 'title'),
                message,
                category: text(d, 'category') as PrayerInput['category'],
                anonymous,
                consent: d.has('consent') as true,
              });
              form.reset();
              setMessage('');
              setAnonymous(true);
              notify(
                IS_DEMO ? 'Pedido salvo no mural de demonstração.' : 'Seu pedido foi enviado.',
              );
            }}
          >
            {(pending) => (
              <>
                <label>
                  Seu primeiro nome <span className="muted">(opcional)</span>
                  <input
                    ref={nameRef}
                    name="name"
                    maxLength={100}
                    placeholder="Como podemos chamar você?"
                  />
                </label>
                <label className="check-line">
                  <input
                    name="anonymous"
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                  />
                  Publicar como pedido anônimo
                </label>
                <label>
                  Como podemos orar?
                  <input
                    name="title"
                    required
                    minLength={5}
                    maxLength={100}
                    placeholder="Ex.: Pela paz na minha família"
                  />
                </label>
                <label>
                  Categoria
                  <select name="category">
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Seu pedido
                  <textarea
                    name="message"
                    required
                    minLength={10}
                    maxLength={650}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    aria-describedby="prayer-char-count"
                    placeholder="Compartilhe o que gostaria de colocar em oração."
                  />
                  <small className="muted" id="prayer-char-count">
                    {message.length}/650 caracteres
                  </small>
                </label>
                <label className="check-line">
                  <input name="consent" type="checkbox" required />
                  {IS_DEMO
                    ? 'Entendi que esta publicação é uma demonstração local.'
                    : 'Concordo em compartilhar este pedido no mural público.'}
                </label>
                <Button className="full" loading={pending}>
                  Compartilhar meu pedido <Icon name="heart" />
                </Button>
              </>
            )}
          </Form>
        </aside>
      </div>
    </main>
  );
}

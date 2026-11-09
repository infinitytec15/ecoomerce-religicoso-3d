'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Address, FaithProfile, StoreSettings, SubscribeInput } from '@/lib/domain/types';
import { useAccount, useCommand, useSession, useSettings } from '@/lib/api/query';
import { IS_DEMO } from '@/lib/api/config';
import { addressSchema } from '@/lib/domain/schemas';
import { money, monthLabel } from '@/lib/domain/format';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { ProductImage } from '@/components/ui/product-image';
import { Steps } from '@/components/ui/steps';
import { AddressFields, emptyAddress } from '@/components/ui/address-fields';
import { Form } from '@/components/ui/form';
import { EmptyState, LoadingState } from '@/components/ui/states';
export function ClubLanding({ initialSettings }: { initialSettings: StoreSettings }) {
  const { data: s = initialSettings } = useSettings(initialSettings);
  return (
    <main id="main" className="club-page">
      <section className="container club-hero">
        <div className="club-hero-copy">
          <h1>
            Uma cesta de fé.
            <br />
            <em>Uma surpresa por mês.</em>
          </h1>
          <p>
            Conheça o <strong>{s.clubName}</strong>: uma seleção de peças cristãs em 3D, uma
            mensagem de oração e um novo motivo para cultivar a fé em casa.
          </p>
          <div className="club-price">
            <strong>{money(s.priceCents)}</strong>
            <span>
              / mês
              <br />
              <small>frete incluído{IS_DEMO ? ' no plano de demonstração' : ''}</small>
            </span>
          </div>
          <ButtonLink href="/clube/assinar">
            Quero fazer parte <Icon name="heart" />
          </ButtonLink>
          <small>
            Plano único · renovação mensal{IS_DEMO ? ' simulada' : ''} · pausa e cancelamento na sua
            conta
          </small>
        </div>
        <div className="club-hero-image">
          <Image
            src="/assets/club-basket.webp"
            alt="Cesta conceitual com peças cristãs em 3D, mensagem de oração e embalagem"
            fill
            sizes="(max-width:600px) 100vw, 50vw"
            preload
          />
          <span>Imagem conceitual · itens variam conforme a edição.</span>
        </div>
      </section>
      <div className="club-ribbon">
        <div className="container">
          {(
            [
              ['box', 'Uma nova edição por mês'],
              ['cross', 'Alinhada à sua caminhada'],
              ['truck', 'Entrega no seu endereço'],
              ['user', 'Você acompanha tudo na conta'],
            ] as [IconName, string][]
          ).map(([icon, label]) => (
            <span key={icon}>
              <Icon name={icon} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <section className="container club-section">
        <h2>
          Uma assinatura.
          <br />
          <em>Muitos pequenos encontros com Deus.</em>
        </h2>
        <div className="club-how">
          {(
            [
              [
                'heart',
                'Escolha sua caminhada.',
                'Cesta católica, evangélica ou cristã, com referências que fazem sentido para você.',
              ],
              [
                'gift',
                'Receba uma nova edição.',
                'Peças 3D selecionadas, uma mensagem de fé e uma embalagem preparada para acolher.',
              ],
              [
                'box',
                'Cultive a fé na rotina.',
                'Acompanhe cada envio e cada cobrança. Pause ou cancele quando quiser.',
              ],
            ] as [IconName, string, string][]
          ).map(([icon, title, description]) => (
            <div key={icon}>
              <span>
                <Icon name={icon} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="container club-edition">
        <div className="club-edition-art">
          <ProductImage
            src="/assets/products/cruz-essencial.webp"
            alt="Cruz Essencial, exemplo da seleção mensal"
          />
          <ProductImage
            src="/assets/products/espirito-santo.webp"
            alt="Espírito Santo, exemplo da seleção mensal"
          />
        </div>
        <div>
          <h2>{s.edition}.</h2>
          <p>
            A edição de {monthLabel(s.editionMonth)} reúne símbolos de paz e esperança. A seleção
            acompanha o perfil escolhido na assinatura.
          </p>
          <ul>
            <li>Peças religiosas impressas em 3D</li>
            <li>Mensagem de oração e cartão da edição</li>
            <li>Embalagem para guardar ou presentear</li>
            <li>Frete incluído no valor mensal{IS_DEMO ? ' demonstrativo' : ''}</li>
          </ul>
          <ButtonLink href="/clube/assinar" variant="secondary">
            Escolher minha cesta <Icon name="arrow" />
          </ButtonLink>
        </div>
      </section>
      <section className="container club-section">
        <div className="club-plan">
          <div>
            <h2>
              Um valor só.
              <br />
              <em>Todo mês, uma nova cesta.</em>
            </h2>
            <p>
              Você conhece o valor antes de começar e encontra o controle da assinatura na sua
              conta.
            </p>
            <div className="details-list">
              <details>
                <summary>Quando a cesta é enviada?</summary>
                <p>
                  A expedição mensal{IS_DEMO ? ' de demonstração' : ''} está prevista para o dia{' '}
                  {s.dispatchDay}. O acompanhamento aparece em Minha conta → Envios do clube.
                </p>
              </details>
              <details>
                <summary>Como funciona o pagamento?</summary>
                <p>
                  Cartão{IS_DEMO ? ' de teste com renovação simulada' : ''} ou Pix mensal, que
                  precisa ser confirmado a cada ciclo.
                  {IS_DEMO ? ' Não usamos dados reais de cartão e nenhum valor é cobrado.' : ''}
                </p>
              </details>
              <details>
                <summary>Posso pausar, pular uma edição ou cancelar?</summary>
                <p>
                  Sim. As ações ficam na área da assinatura. Uma cesta já paga mantém seu histórico
                  de envio; a pausa ou o cancelamento interrompem as próximas renovações.
                </p>
              </details>
            </div>
          </div>
          <aside>
            <span className="badge olive">Plano mensal único</span>
            <h3>{s.clubName}</h3>
            <div className="club-plan-price">
              {money(s.priceCents)}
              <small>/ mês</small>
            </div>
            <p>Frete incluído · seleção conforme seu perfil</p>
            <ButtonLink className="full" href="/clube/assinar">
              Começar minha assinatura <Icon name="arrow" />
            </ButtonLink>
            {IS_DEMO && (
              <small>
                Preço, composição e condições ilustrativos e editáveis no painel administrador.
              </small>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
export function SubscriptionCheckout({ initialSettings }: { initialSettings: StoreSettings }) {
  const { data: s = initialSettings } = useSettings(initialSettings),
    session = useSession(),
    account = useAccount(),
    existing = account.data?.subscriptions.find((x) => x.status !== 'Cancelada'),
    [step, setStep] = useState(0),
    [profile, setProfile] = useState<FaithProfile>('Cristã'),
    [finish, setFinish] = useState('Marfim'),
    [address, setAddress] = useState<Address>(emptyAddress),
    [payment, setPayment] = useState<'card' | 'pix'>('card'),
    [submitted, setSubmitted] = useState(false),
    key = useRef(''),
    subscribe = useCommand((g, input: SubscribeInput) => g.subscribe(input)),
    router = useRouter();
  if (submitted)
    return (
      <main id="main" className="container">
        <LoadingState label="Preparando seu primeiro capítulo no clube…" />
      </main>
    );
  if (existing && session.data?.role === 'customer')
    return (
      <main id="main" className="container">
        <EmptyState
          title="Você já faz parte deste cantinho."
          description={`Sua assinatura está ${existing.status.toLowerCase()}. Gerencie seus próximos passos na sua conta.`}
          action={
            <ButtonLink href="/conta/assinatura">
              Ver minha assinatura <Icon name="arrow" />
            </ButtonLink>
          }
        />
      </main>
    );
  return (
    <main id="main" className="container">
      <div className="checkout-layout club-checkout">
        <section>
          <Link className="arrow-link" href="/clube">
            Voltar ao clube
          </Link>
          <h1>Sua próxima surpresa começa aqui.</h1>
          <Steps items={['Sua cesta', 'Seus dados', 'Assinatura']} current={step} />
          {IS_DEMO && (
            <div className="notice" style={{ marginTop: 24 }}>
              Assinatura de demonstração. Use dados fictícios; nenhuma renovação real será criada.
            </div>
          )}
          <Form
            className="stack"
            key={step}
            onSubmit={async (d) => {
              if (step === 1) addressSchema.parse(address);
              if (step < 2) {
                setStep(step + 1);
                window.scrollTo(0, 0);
                return;
              }
              if (!key.current) key.current = crypto.randomUUID();
              const result = await subscribe.mutateAsync({
                profile,
                finish,
                address,
                payment,
                consent: d.has('consent'),
                idempotencyKey: key.current,
              });
              setSubmitted(true);
              router.push('/checkout/sucesso?pedido=' + encodeURIComponent(result.orderId));
            }}
          >
            {(pending) => (
              <>
                {step === 0 ? (
                  <>
                    <h2 style={{ fontSize: 22 }}>Qual caminho acolhe a sua fé?</h2>
                    {(
                      [
                        ['Católica', 'Imagens sacras e símbolos de devoção.'],
                        ['Evangélica', 'A Palavra, a cruz e lembretes da caminhada cristã.'],
                        ['Cristã', 'Símbolos de paz, amor e esperança em Cristo.'],
                      ] as [FaithProfile, string][]
                    ).map(([p, description]) => (
                      <label className={`radio-card ${profile === p ? 'active' : ''}`} key={p}>
                        <input
                          type="radio"
                          name="profile"
                          checked={profile === p}
                          onChange={() => setProfile(p)}
                        />
                        <span className="grow">
                          <strong>Cesta {p.toLowerCase()}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                    <label>
                      Preferência de acabamento
                      <select value={finish} onChange={(e) => setFinish(e.target.value)}>
                        {['Marfim', 'Terracota', 'Surpresa'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <p className="demo-text">
                      A curadoria de cada mês é uma surpresa dentro do perfil escolhido. Imagens e
                      composições são conceituais.
                    </p>
                  </>
                ) : step === 1 ? (
                  <AddressFields value={address} onChange={setAddress} />
                ) : (
                  <>
                    <h2 style={{ fontSize: 22 }}>Como você prefere renovar?</h2>
                    {(
                      [
                        ['card', 'Cartão', 'Renovação mensal' + (IS_DEMO ? ' simulada' : '') + '.'],
                        ['pix', 'Pix mensal', 'A cada mês, confirme um novo pagamento Pix.'],
                      ] as const
                    ).map(([id, title, description]) => (
                      <label className={`radio-card ${payment === id ? 'active' : ''}`} key={id}>
                        <input
                          type="radio"
                          name="payment"
                          checked={payment === id}
                          onChange={() => setPayment(id)}
                        />
                        <span className="grow">
                          <strong>
                            {title}
                            {id === 'card' && IS_DEMO ? ' de teste' : ''}
                          </strong>
                          <small>{description}</small>
                        </span>
                        <Icon name={id === 'card' ? 'card' : 'pix'} />
                      </label>
                    ))}
                    <div className="demo-card">
                      <Icon name={payment === 'card' ? 'card' : 'pix'} />
                      <div>
                        <strong>
                          {payment === 'card'
                            ? IS_DEMO
                              ? 'Cartão de demonstração ···· 4242'
                              : 'Cartão pelo provedor'
                            : 'Pix mensal'}
                        </strong>
                        <small>{money(s.priceCents)} por ciclo mensal, com frete incluído.</small>
                      </div>
                    </div>
                    <label className="check-line">
                      <input name="consent" type="checkbox" required />
                      Entendi que este plano é mensal, com renovação{IS_DEMO
                        ? ' simulada'
                        : ''} de {money(s.priceCents)}, e posso pausar ou cancelar na minha conta.
                    </label>
                  </>
                )}
                <div className="form-actions">
                  {step > 0 ? (
                    <Button type="button" variant="text" onClick={() => setStep(step - 1)}>
                      Voltar
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button loading={pending}>
                    {step === 2
                      ? 'Confirmar assinatura' + (IS_DEMO ? ' de demonstração' : '')
                      : 'Continuar'}{' '}
                    <Icon name="arrow" />
                  </Button>
                </div>
              </>
            )}
          </Form>
        </section>
        <aside className="summary club-summary">
          <ProductImage
            className="summary-photo"
            src="/assets/club-basket.webp"
            alt="Cesta mensal conceitual"
            sizes="365px"
          />
          <h2>{s.clubName}</h2>
          <div className="money-line">
            <span>Periodicidade</span>
            <strong>Mensal</strong>
          </div>
          <div className="money-line">
            <span>Seu perfil</span>
            <span>{profile}</span>
          </div>
          <div className="money-line">
            <span>Frete</span>
            <span>Incluído</span>
          </div>
          <div className="money-line total">
            <span>Por mês</span>
            <strong>{money(s.priceCents)}</strong>
          </div>
          {IS_DEMO && (
            <small>
              Renovação de demonstração. Nenhuma cobrança ou entrega real será realizada.
            </small>
          )}
          <Link className="text-btn" href="/clube">
            Ver o plano
          </Link>
        </aside>
      </div>
    </main>
  );
}

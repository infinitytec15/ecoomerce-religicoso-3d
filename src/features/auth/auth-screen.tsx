'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useCommand } from '@/lib/api/query';
import { IS_DEMO } from '@/lib/api/config';
import { useNotify } from '@/components/ui/feedback';
import { usePreference, writePreference } from '@/lib/store/preferences';
import type { LoginInput } from '@/lib/domain/schemas';
export const STAFF_DEMO_EMAIL = 'gestao@maosemoracao.demo';
export const STAFF_DEMO_PASSWORD = 'Essencia3D!';
export function safeReturnTo(path: string | undefined, kind: 'customer' | 'staff') {
  const fallback = kind === 'staff' ? '/admin' : '/conta';
  return path &&
    path.startsWith(fallback) &&
    !path.includes('\\') &&
    !path.includes('://') &&
    !path.includes('/login')
    ? path
    : fallback;
}
export function AuthScreen({
  kind = 'customer',
  returnTo,
}: {
  kind?: 'customer' | 'staff';
  returnTo?: string;
}) {
  const staff = kind === 'staff',
    [mode, setMode] = useState<'login' | 'register' | 'recover'>('login'),
    [emailOverride, setEmail] = useState<string | null>(null),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false),
    [name, setName] = useState(''),
    [rememberOverride, setRemember] = useState<boolean | null>(null),
    [recoveryMessage, setRecoveryMessage] = useState(''),
    savedEmail = usePreference('auth-email-' + (staff ? 'admin' : 'customer')),
    email = emailOverride ?? savedEmail ?? '',
    remember = rememberOverride ?? !!savedEmail,
    login = useCommand((g, input: LoginInput) => g.login(input)),
    recover = useCommand((g, input: { email: string; kind: 'customer' | 'staff' }) =>
      g.recover(input.email, input.kind),
    ),
    notify = useNotify(),
    router = useRouter(),
    contentRef = useRef<HTMLDivElement>(null),
    photoRef = useRef<HTMLDivElement>(null),
    keyboardAt = useRef(0),
    register = mode === 'register',
    recovering = mode === 'recover';
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (['Tab', 'Enter', ' '].includes(e.key)) keyboardAt.current = Date.now();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, []);
  useEffect(() => {
    if (Date.now() - keyboardAt.current < 1000) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches,
      animations: Animation[] = [];
    if (contentRef.current)
      animations.push(
        contentRef.current.animate(
          reduced
            ? [{ opacity: 0.8 }, { opacity: 1 }]
            : [
                { opacity: 0.55, transform: 'translateY(10px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
          { duration: reduced ? 100 : 240, easing: 'cubic-bezier(.23,1,.32,1)' },
        ),
      );
    if (photoRef.current && !reduced && mode === 'login')
      animations.push(
        photoRef.current.animate(
          [
            { clipPath: 'inset(0 0 4% 0)', transform: 'translateY(6px)' },
            { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
          ],
          { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)' },
        ),
      );
    return () => animations.forEach((a) => a.cancel());
  }, [mode, kind]);
  async function submit(data: FormData) {
    if (recovering) {
      const result = await recover.mutateAsync({ email, kind });
      setRecoveryMessage(result.message);
      return;
    }
    await login.mutateAsync({ email, password, kind, name: register ? name : undefined, register });
    writePreference(
      'auth-email-' + (staff ? 'admin' : 'customer'),
      data.has('remember') ? email : '',
    );
    setPassword('');
    notify(IS_DEMO ? 'Seu acesso de demonstração está pronto.' : 'Bem-vindo de volta.');
    router.replace(safeReturnTo(returnTo, kind));
    router.refresh();
  }
  return (
    <div className="auth-mode">
      <div className="auth-page">
        <header className="auth-header">
          <Logo />
          <Link className="auth-back" href="/">
            Voltar para a loja <Icon name="arrow" />
          </Link>
        </header>
        <main id="main" className="auth-layout">
          <aside className="auth-story" aria-label="A fé ganha forma">
            <div className="auth-photograph" ref={photoRef}>
              <Image
                src="/assets/faith-home.webp"
                alt="Mãos sobre uma Bíblia aberta, com uma cruz e a palavra Fé em uma mesa iluminada"
                fill
                sizes="(max-width:700px) 0vw, 50vw"
                preload
              />
              <span>Imagem conceitual · Mãos em Oração</span>
            </div>
            <div className="auth-story-copy">
              <h2>
                O cuidado também
                <br />é uma forma <em>de fé.</em>
              </h2>
              <p>
                {staff
                  ? 'Por trás de cada peça, existe uma história. E alguém cuidando de cada detalhe.'
                  : 'Pequenos lembretes de um amor maior. Perto de você, em cada novo capítulo.'}
              </p>
              <div className="auth-story-signature">
                <Icon name="heart" />
                Fé para viver. Amor para compartilhar.
              </div>
            </div>
          </aside>
          <section className="auth-form-region">
            <div className="auth-form-wrap">
              <nav className="auth-audience" aria-label="Tipo de acesso">
                <Link href="/login" aria-current={!staff ? 'page' : undefined}>
                  Sou cliente
                </Link>
                <Link href="/admin/login" aria-current={staff ? 'page' : undefined}>
                  Sou da equipe <Icon name="lock" />
                </Link>
              </nav>
              <div className="auth-form-content" ref={contentRef}>
                <h1>
                  {recovering
                    ? 'Vamos reencontrar o caminho.'
                    : register
                      ? 'Faça parte deste cantinho.'
                      : 'Bem-vindo de volta.'}
                </h1>
                <p className="auth-intro">
                  {recovering
                    ? 'Informe seu e-mail para recuperar o acesso.'
                    : register
                      ? 'Crie seu espaço para guardar escolhas e acompanhar cada nova história.'
                      : staff
                        ? 'Entre para cuidar da loja e de cada nova história.'
                        : 'Seu espaço para acompanhar pedidos, cuidar da assinatura e guardar o que toca você.'}
                </p>
                {!staff && !recovering && (
                  <div className="auth-account-tabs" role="group" aria-label="Acesso da conta">
                    <button aria-pressed={!register} onClick={() => setMode('login')}>
                      Entrar
                    </button>
                    <button aria-pressed={register} onClick={() => setMode('register')}>
                      Criar conta
                    </button>
                  </div>
                )}
                <Form className="auth-form" key={mode} onSubmit={submit}>
                  {(pending) => (
                    <>
                      {register && (
                        <>
                          <label htmlFor="auth-name">Como podemos chamar você?</label>
                          <div className="auth-input">
                            <Icon name="user" />
                            <input
                              id="auth-name"
                              name="name"
                              required
                              minLength={2}
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Seu nome"
                              autoComplete={IS_DEMO ? 'off' : 'name'}
                            />
                          </div>
                        </>
                      )}
                      <label htmlFor="auth-email">
                        {IS_DEMO ? 'E-mail de demonstração' : 'E-mail'}
                      </label>
                      <div className="auth-input">
                        <Icon name="mail" />
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={staff && IS_DEMO ? STAFF_DEMO_EMAIL : 'seunome@exemplo.com'}
                          autoComplete={IS_DEMO ? 'off' : 'username'}
                        />
                      </div>
                      {!recovering && (
                        <>
                          <div className="auth-label-row">
                            <label htmlFor="auth-password">
                              {IS_DEMO ? 'Senha fictícia' : 'Senha'}
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setMode('recover');
                                setPassword('');
                              }}
                            >
                              Esqueci minha senha
                            </button>
                          </div>
                          <div className="auth-input">
                            <Icon name="lock" />
                            <input
                              id="auth-password"
                              name="password"
                              type={show ? 'text' : 'password'}
                              required
                              minLength={IS_DEMO ? 4 : 8}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder={
                                staff && IS_DEMO ? 'Senha do acesso de teste' : 'Sua senha'
                              }
                              autoComplete={
                                IS_DEMO ? 'off' : register ? 'new-password' : 'current-password'
                              }
                            />
                            <button
                              type="button"
                              className="auth-eye"
                              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={show}
                              onClick={() => setShow(!show)}
                            >
                              <Icon name={show ? 'eyeOff' : 'eye'} />
                            </button>
                          </div>
                          <label className="auth-remember">
                            <input
                              type="checkbox"
                              name="remember"
                              checked={remember}
                              onChange={(e) => setRemember(e.target.checked)}
                            />
                            Lembrar meu e-mail neste navegador
                          </label>
                        </>
                      )}
                      {recovering && IS_DEMO && (
                        <p className="auth-caption">
                          Esta é uma simulação. Nenhum e-mail será enviado.
                        </p>
                      )}
                      <Button
                        className="auth-submit"
                        loading={pending}
                        disabled={recovering && !!recoveryMessage}
                      >
                        {recovering
                          ? IS_DEMO
                            ? 'Simular recuperação'
                            : 'Recuperar acesso'
                          : staff
                            ? 'Entrar na gestão'
                            : register
                              ? 'Criar minha conta'
                              : 'Entrar na minha conta'}{' '}
                        <Icon name="arrow" />
                      </Button>
                      {recoveryMessage && recovering && (
                        <div className="auth-feedback" role="status">
                          <Icon name="check" />
                          <span>{recoveryMessage}</span>
                        </div>
                      )}
                    </>
                  )}
                </Form>
                {recovering ? (
                  <Button
                    variant="text"
                    className="auth-return"
                    onClick={() => {
                      setMode('login');
                      setRecoveryMessage('');
                    }}
                  >
                    Voltar ao login
                  </Button>
                ) : (
                  IS_DEMO && (
                    <>
                      <div className="auth-demo-divider">
                        <span>Conheça por dentro</span>
                      </div>
                      <Button
                        variant="secondary"
                        className="auth-demo-button"
                        onClick={async () => {
                          if (staff) {
                            setEmail(STAFF_DEMO_EMAIL);
                            setPassword(STAFF_DEMO_PASSWORD);
                            setShow(false);
                            notify('Acesso de teste preenchido. Clique em Entrar na gestão.');
                          } else {
                            await login.mutateAsync({
                              email: 'ana@exemplo.com',
                              password: 'demonstracao',
                              kind: 'customer',
                            });
                            router.replace(safeReturnTo(returnTo, 'customer'));
                          }
                        }}
                      >
                        <Icon name="spark" />
                        {staff
                          ? 'Preencher acesso de demonstração'
                          : 'Explorar com uma conta de teste'}
                      </Button>
                      {staff && (
                        <p className="auth-demo-credentials">
                          Acesso de teste: <strong>{STAFF_DEMO_EMAIL}</strong>
                        </p>
                      )}
                    </>
                  )
                )}
              </div>
              {IS_DEMO && (
                <p className="auth-local-note">
                  <Icon name="shield" />
                  <span>
                    Protótipo visual · use apenas dados fictícios.
                    <br />O login é simulado e não protege dados reais.
                  </span>
                </p>
              )}
            </div>
            <footer className="auth-footer">
              <span>Mãos em Oração · Essência</span>
              <Link href="/suporte/privacidade">Privacidade e dados</Link>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}

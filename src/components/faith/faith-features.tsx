'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { useCommand } from '@/lib/api/query';
import { IS_DEMO } from '@/lib/api/config';
import type { NewsletterInput } from '@/lib/domain/schemas';
import { useUiStore } from '@/lib/store/ui';
import { readPreference, usePreference, writePreference } from '@/lib/store/preferences';
import { useNotify } from '@/components/ui/feedback';
const verses = [
  { text: 'Façam tudo com amor.', reference: '1 Coríntios 16:14', search: '1 Coríntios 16:14' },
  {
    text: 'Deus é o nosso refúgio e a nossa fortaleza.',
    reference: 'Salmos 46:1 · trecho',
    search: 'Salmos 46:1',
  },
  {
    text: 'Lancem sobre ele toda a sua ansiedade…',
    reference: '1 Pedro 5:7 · trecho',
    search: '1 Pedro 5:7',
  },
];
export default function FaithFeatures() {
  const path = usePathname(),
    busy = path.startsWith('/checkout') || path === '/clube/assinar',
    open = useUiStore((s) => s.newsletterOpen),
    setOpen = useUiStore((s) => s.setNewsletterOpen),
    [verseIndex, setVerseIndex] = useState(0),
    [visible, setVisible] = useState(false),
    bible = useRef<HTMLDivElement>(null),
    lastVerseAt = useRef(0),
    keyboardAt = useRef(0),
    dismiss = useRef<ReturnType<typeof setTimeout> | null>(null),
    v = verses[verseIndex % verses.length];
  const hide = useCallback(() => setVisible(false), []),
    scheduleDismiss = useCallback(() => {
      if (dismiss.current) clearTimeout(dismiss.current);
      dismiss.current = setTimeout(() => setVisible(false), 10000);
    }, []);
  const show = useCallback(
    (manual = false) => {
      if (!manual && Date.now() - lastVerseAt.current < 30000) return;
      lastVerseAt.current = Date.now();
      setVerseIndex((i) => i + 1);
      setVisible(true);
      scheduleDismiss();
    },
    [scheduleDismiss],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (['Enter', 'Tab'].includes(e.key)) keyboardAt.current = Date.now();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, []);
  useEffect(() => {
    if (busy) return;
    const animations: Animation[] = [];
    if (
      bible.current &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches &&
      Date.now() - keyboardAt.current > 1000
    ) {
      animations.push(
        bible.current.animate(
          [
            { opacity: 0, transform: 'translate(-50%,8px) scale(.95)' },
            { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.32 },
            { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.7 },
            { opacity: 0, transform: 'translate(-50%,-5px) scale(1)' },
          ],
          { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)' },
        ),
      );
      for (const [selector, from, to] of [
        ['.arrival-left', 65, -12],
        ['.arrival-right', -65, 12],
      ] as const) {
        const page = bible.current.querySelector(selector);
        if (page)
          animations.push(
            page.animate(
              [
                { transform: `perspective(250px) rotateY(${from}deg)` },
                { transform: `perspective(250px) rotateY(${to}deg)` },
              ],
              { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' },
            ),
          );
      }
    }
    const timer = setTimeout(() => show(), 900);
    return () => {
      clearTimeout(timer);
      animations.forEach((a) => a.cancel());
    };
  }, [path, busy, show]);
  useEffect(() => {
    if (busy) return;
    const timer = setTimeout(() => {
      let legacySubscribed = false;
      try {
        legacySubscribed = !!JSON.parse(readPreference('newsletter') || 'null')?.subscribed;
      } catch {}
      if (
        readPreference('newsletter-subscribed') === 'true' ||
        legacySubscribed ||
        Date.now() < Number(readPreference('newsletter-snooze') || 0) ||
        sessionStorage.getItem('meo-newsletter-shown') ||
        document.querySelector('[role="dialog"]') ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '') ||
        path.startsWith('/cantinho')
      )
        return;
      sessionStorage.setItem('meo-newsletter-shown', '1');
      setOpen(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [path, busy, setOpen]);
  useEffect(
    () => () => {
      if (dismiss.current) clearTimeout(dismiss.current);
    },
    [],
  );
  function closeNewsletter(value: boolean) {
    setOpen(value);
    if (!value) writePreference('newsletter-snooze', String(Date.now() + 48 * 60 * 60 * 1000));
  }
  return (
    <>
      {!busy && (
        <>
          <aside
            className={`verse-toast ${visible ? 'visible' : ''}`}
            aria-label="Versículo para o seu dia"
            aria-live="polite"
            aria-atomic="true"
            aria-hidden={!visible}
            inert={!visible}
            onMouseEnter={() => {
              if (dismiss.current) clearTimeout(dismiss.current);
            }}
            onMouseLeave={scheduleDismiss}
            onFocus={() => {
              if (dismiss.current) clearTimeout(dismiss.current);
            }}
            onBlur={scheduleDismiss}
          >
            <span className="verse-toast-icon">
              <Icon name="book" />
            </span>
            <div className="verse-toast-content">
              <p>“{v.text}”</p>
              <a
                href={
                  'https://www.biblegateway.com/passage/?search=' +
                  encodeURIComponent(v.search) +
                  '&version=NVI-PT'
                }
                target="_blank"
                rel="noreferrer"
              >
                {v.reference} · NVI <Icon name="arrow" />
              </a>
              <button className="verse-next" onClick={() => show(true)}>
                Outro versículo
              </button>
            </div>
            <button className="icon-btn verse-dismiss" aria-label="Fechar versículo" onClick={hide}>
              <Icon name="close" />
            </button>
          </aside>
          <button
            className="devotion-trigger"
            aria-label="Mostrar um versículo bíblico"
            title="Uma palavra para o seu dia"
            onClick={() => show(true)}
          >
            <Icon name="book" />
          </button>
          <div ref={bible} className="bible-arrival" aria-hidden="true">
            <span className="arrival-book">
              <i className="arrival-page arrival-left" />
              <i className="arrival-page arrival-right" />
              <i className="arrival-spine" />
            </span>
          </div>
        </>
      )}
      <Modal
        open={open && !busy}
        onOpenChange={closeNewsletter}
        title="Receber oração diária por e-mail"
        className="newsletter-dialog"
      >
        <NewsletterContent onClose={() => closeNewsletter(false)} />
      </Modal>
    </>
  );
}
export function NewsletterContent({ onClose }: { onClose: () => void }) {
  const subscribe = useCommand((g, input: NewsletterInput) => g.newsletter(input)),
    unsubscribe = useCommand((g, token: string | undefined) => g.unsubscribeNewsletter(token)),
    [done, setDone] = useState(''),
    token = usePreference('newsletter-token'),
    subscribed = usePreference('newsletter-subscribed'),
    notify = useNotify();
  return (
    <div className="newsletter-layout">
      <div className="prayer-popup-story">
        <Icon name="book" />
        <h2>
          Uma pausa.
          <br />
          Uma oração.
          <br />
          <em>Um novo dia.</em>
        </h2>
        <p>
          “Senhor, guia meus passos hoje. Que eu encontre paz para seguir e amor para compartilhar.
          Amém.”
        </p>
        <small>Oração de acolhimento · texto autoral</small>
      </div>
      <div className="prayer-popup-form">
        <h2>
          Comece o dia
          <br />
          com o coração em Deus.
        </h2>
        <p>
          Receba uma oração diária por e-mail, gratuitamente. Um momento de fé para acompanhar sua
          manhã.
        </p>
        <span className="badge olive">Grátis · sem compromisso</span>
        {IS_DEMO && <div className="notice">Inscrição demonstrativa. Nenhum e-mail é enviado.</div>}
        {done ? (
          <div className="stack">
            <p role="status">{done}</p>
            <Button onClick={onClose}>Continuar minha caminhada</Button>
          </div>
        ) : (
          <Form
            onSubmit={async (d) => {
              const result = await subscribe.mutateAsync({
                name: text(d, 'name'),
                email: text(d, 'email'),
                consent: d.has('consent') as true,
              });
              writePreference('newsletter-subscribed', 'true');
              if (result.token) writePreference('newsletter-token', result.token);
              setDone(result.message);
            }}
          >
            {(pending) => (
              <>
                <label>
                  Seu primeiro nome <span className="muted">(opcional)</span>
                  <input name="name" maxLength={100} placeholder="Como podemos chamar você?" />
                </label>
                <label>
                  {IS_DEMO ? 'E-mail de demonstração' : 'E-mail'}
                  <input name="email" type="email" required placeholder="voce@exemplo.com" />
                </label>
                <label className="check-line">
                  <input name="consent" type="checkbox" required />
                  Quero receber uma oração diária e posso cancelar quando quiser.
                </label>
                <Button className="full" loading={pending}>
                  Quero receber minha oração <Icon name="heart" />
                </Button>
              </>
            )}
          </Form>
        )}
        <Button variant="text" onClick={onClose}>
          Agora não, obrigada(o)
        </Button>
        {subscribed === 'true' && token && (
          <Button
            variant="text"
            loading={unsubscribe.isPending}
            onClick={async () => {
              await unsubscribe.mutateAsync(token);
              writePreference('newsletter-subscribed', 'false');
              writePreference('newsletter-token', '');
              notify('Inscrição cancelada.');
              onClose();
            }}
          >
            Cancelar minha inscrição
          </Button>
        )}
      </div>
    </div>
  );
}

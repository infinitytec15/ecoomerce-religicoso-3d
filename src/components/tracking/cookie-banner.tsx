'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  onConsentOpen,
  openConsentSettings,
  saveConsent,
  useConsent,
} from '@/lib/tracking/consent';

/**
 * LGPD cookie notice. Shows until the visitor chooses; "Personalizar" lets them pick
 * measurement and marketing separately. Reopened from the footer and the privacy policy.
 */
export function CookieBanner() {
  const consent = useConsent(),
    [reopened, setReopened] = useState(false),
    [custom, setCustom] = useState(false),
    [analytics, setAnalytics] = useState(false),
    [marketing, setMarketing] = useState(false);

  useEffect(
    () =>
      onConsentOpen(() => {
        setAnalytics(consent?.analytics ?? false);
        setMarketing(consent?.marketing ?? false);
        setCustom(true);
        setReopened(true);
      }),
    [consent],
  );

  // Server render and the first client render agree on "nothing"; the choice lives in storage.
  if (consent === undefined || (consent && !reopened)) return null;

  const choose = (value: { analytics: boolean; marketing: boolean }) => {
    saveConsent(value);
    setReopened(false);
    setCustom(false);
  };

  return (
    <section
      className="cookie-banner"
      role="dialog"
      aria-label="Aviso de cookies"
      aria-live="polite"
    >
      <div className="cookie-banner-text">
        <strong>Sua privacidade importa.</strong>
        <p>
          Usamos cookies essenciais para a loja funcionar. Com a sua permissão, também usamos
          cookies de medição e de marketing para entender as visitas e mostrar nossas peças a quem
          se interessa por elas. Saiba mais na{' '}
          <Link href="/politica-de-privacidade#cookies">Política de Privacidade</Link>.
        </p>
      </div>
      {custom && (
        <fieldset className="cookie-banner-options">
          <legend className="sr-only">Escolha os cookies</legend>
          <label className="check-line">
            <input type="checkbox" checked disabled />
            Essenciais: login, carrinho e segurança (sempre ativos)
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
            Medição: estatísticas de visita (Google Analytics)
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
            Marketing: anúncios e medição de campanhas (Meta)
          </label>
        </fieldset>
      )}
      <div className="cookie-banner-actions">
        {custom ? (
          <Button onClick={() => choose({ analytics, marketing })}>Salvar escolhas</Button>
        ) : (
          <>
            <Button onClick={() => choose({ analytics: true, marketing: true })}>
              Aceitar todos
            </Button>
            <Button
              variant="secondary"
              onClick={() => choose({ analytics: false, marketing: false })}
            >
              Só os essenciais
            </Button>
            <Button variant="text" onClick={() => setCustom(true)}>
              Personalizar
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Footer / policy link that reopens the banner. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? 'footer-link-button'}
      onClick={openConsentSettings}
    >
      Preferências de cookies
    </button>
  );
}

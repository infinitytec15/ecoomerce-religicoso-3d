/**
 * Shown while a payment is being confirmed: the brand's praying hands "breathe"
 * while halos ripple outward, so a wait the customer cannot shorten reads as calm,
 * not stuck. Pure CSS (keeps running smoothly while the page polls/loads).
 */
export function PrayingWait({
  title = 'Confirmando seu pagamento…',
  description = 'Isso costuma levar alguns segundos. Você pode manter esta página aberta.',
  compact = false,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div className={`praying-wait${compact ? ' compact' : ''}`} role="status" aria-live="polite">
      <div className="praying-mark" aria-hidden="true">
        <span className="praying-halo" />
        <span className="praying-halo" />
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
        <img src="/assets/maos-em-oracao-mark.png" alt="" width={120} height={120} />
      </div>
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

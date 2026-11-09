import Link from 'next/link';
export function Logo() {
  return (
    <Link className="brand" href="/" aria-label="Mãos em Oração, início">
      <span className="brand-symbol" aria-hidden="true" />
      <span className="brand-wordmark">
        <span>Mãos em</span>
        <strong>Oração</strong>
      </span>
    </Link>
  );
}

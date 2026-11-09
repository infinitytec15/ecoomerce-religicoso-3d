import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
type Variant = 'primary' | 'secondary' | 'light' | 'danger' | 'text';
export function buttonClass(variant: Variant = 'primary', className = '') {
  return `${variant === 'text' ? 'text-btn' : 'btn'} ${variant === 'primary' || variant === 'text' ? '' : variant} ${className}`.trim();
}
export function Button({
  variant = 'primary',
  className = '',
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={buttonClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
      {loading && <span className="sr-only"> — aguardando resposta</span>}
    </button>
  );
}
export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import { Button } from './button';
export function EmptyState({
  title,
  description,
  icon = 'box',
  action,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function LoadingState({ label = 'Preparando seu espaço…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton" />
      <div className="skeleton" />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <Icon name="chat" />
      <h2>Vamos tentar mais uma vez.</h2>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return <div className={`notice ${tone === 'warn' ? 'warn' : ''}`}>{children}</div>;
}

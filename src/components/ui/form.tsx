'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ZodError } from 'zod';
import { errorMessage } from '@/lib/api/contracts';
export function Form({
  children,
  onSubmit,
  className = 'stack',
  id,
  onInvalid,
}: {
  children: ReactNode | ((pending: boolean) => ReactNode);
  onSubmit: (data: FormData, form: HTMLFormElement) => Promise<void> | void;
  className?: string;
  id?: string;
  onInvalid?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError('');
    try {
      await onSubmit(new FormData(form), form);
    } catch (e) {
      setError(
        e instanceof ZodError ? e.issues[0]?.message || 'Confira os campos.' : errorMessage(e),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form id={id} className={className} onSubmit={submit} onInvalidCapture={onInvalid}>
      <fieldset disabled={pending} className="form-fieldset">
        {typeof children === 'function' ? children(pending) : children}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export const text = (data: FormData, key: string) => String(data.get(key) || '').trim();
export const number = (data: FormData, key: string) => Number(data.get(key) || 0);
export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}

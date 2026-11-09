import { expect, it } from 'vitest';
import { readPreference, writePreference } from './preferences';
it('unwraps the original JSON-encoded remembered email without changing its original value', () => {
  localStorage.setItem('amago-auth-email-admin', '"gestao@maosemoracao.demo"');
  expect(readPreference('auth-email-admin')).toBe('gestao@maosemoracao.demo');
  expect(localStorage.getItem('amago-auth-email-admin')).toBe('"gestao@maosemoracao.demo"');
});
it('preserves legacy object JSON used by the prayer invitation', () => {
  const original = '{"subscribed":true,"email":"exemplo@exemplo.com"}';
  localStorage.setItem('amago-newsletter', original);
  expect(readPreference('newsletter')).toBe(original);
});
it('honors clearing a new preference instead of falling back to the old value', () => {
  localStorage.setItem('amago-auth-email-admin', '"old@exemplo.com"');
  writePreference('auth-email-admin', '');
  expect(readPreference('auth-email-admin')).toBe('');
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';
import {
  seal,
  unseal,
  signedToken,
  readSignedToken,
  hashPassword,
  verifyPassword,
  sessionHash,
} from './security';
import { permit, ownerOnly, safeCsv, nextMonth, type Actor } from './shared';
const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test@127.0.0.1/test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  PUBLIC_WEB_URL: 'http://127.0.0.1:4502',
  PUBLIC_API_URL: 'http://127.0.0.1:4500',
  SESSION_SECRET: 's'.repeat(64),
  BFF_SHARED_SECRET: 'b'.repeat(64),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  INTEGRATIONS_MODE: 'mock',
});
describe('segurança e regras da API', () => {
  it('usa criptografia autenticada e rejeita alterações', () => {
    const value = seal({ token: 'sensitive-token', email: 'cliente@example.test' }, config);
    expect(value).not.toContain('sensitive-token');
    expect(unseal(value, config)).toEqual({
      token: 'sensitive-token',
      email: 'cliente@example.test',
    });
    const parts = value.split('.');
    parts[3] = 'AA' + parts[3].slice(2);
    expect(() => unseal(parts.join('.'), config)).toThrow();
  });
  it('restringe tokens assinados por finalidade e validade', () => {
    const valid = signedToken(
      { purpose: 'unsubscribe', id: 'subscriber', version: 1, expiresAt: Date.now() + 60000 },
      config,
    );
    expect(readSignedToken(valid, 'unsubscribe', config).id).toBe('subscriber');
    expect(() => readSignedToken(valid, 'reset', config)).toThrow();
    expect(() =>
      readSignedToken(
        signedToken({ purpose: 'unsubscribe', id: 's', version: 1, expiresAt: 1 }, config),
        'unsubscribe',
        config,
      ),
    ).toThrow();
    expect(sessionHash('session-token', config)).not.toContain('session-token');
  });
  it('armazena Argon2id e rejeita senha incorreta', async () => {
    const password = 'ApenasParaTeste!2026',
      value = await hashPassword(password);
    expect(value).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(value, password)).toBe(true);
    expect(await verifyPassword(value, 'errada')).toBe(false);
  });
  it('nega permissão ausente e impede elevação por role admin', () => {
    const actor: Actor = {
      id: 'one',
      name: 'Equipe',
      email: 'equipe@example.test',
      role: 'admin',
      permissions: ['production'],
      owner: false,
      demo: false,
    };
    expect(() => permit(actor, 'finance')).toThrow();
    expect(() => ownerOnly(actor)).toThrow();
    expect(permit(actor, 'production')).toBe(actor);
  });
  it('não permite mock ou HTTP público em produção', () => {
    expect(() =>
      loadConfig({
        ...Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])),
        NODE_ENV: 'production',
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        ...Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])),
        PUBLIC_WEB_URL: 'http://external.example',
      }),
    ).toThrow();
    const live = {
      ...Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])),
      NODE_ENV: 'production',
      INTEGRATIONS_MODE: 'live',
      PUBLIC_WEB_URL: 'https://shop.example',
      PUBLIC_API_URL: 'https://api.example',
    };
    expect(loadConfig(live).SHIPPING_SIMULATED).toBe('false');
    expect(() => loadConfig({ ...live, SHIPPING_SIMULATED: 'true' })).toThrow(/Frete simulado/);
  });
  it('neutraliza fórmulas CSV e conserva fim de mês', () => {
    expect(safeCsv('=HYPERLINK("https://example.test")').startsWith('"\'')).toBe(true);
    expect(safeCsv('\t+123').startsWith('"\'')).toBe(true);
    expect(nextMonth(new Date('2026-01-31T12:00:00Z')).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });
});

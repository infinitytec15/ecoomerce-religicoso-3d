import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { hash, verify, argon2id } from 'argon2';
import type { BackendConfig } from './config';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export function recipientHash(email: string, config: BackendConfig) {
  return createHmac('sha256', Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64'))
    .update('email:' + normalizeEmail(email))
    .digest('hex');
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function sessionHash(value: string, config: BackendConfig) {
  return createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
}
export function seal(value: unknown, config: BackendConfig) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}
export function unseal<T>(value: string, config: BackendConfig): T {
  const [v, iv, tag, data] = value.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Encrypted payload invalid.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'base64'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString(
      'utf8',
    ),
  ) as T;
}
export const hashPassword = (password: string) =>
  hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export async function verifyPassword(hash: string, password: string) {
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}
export function signedToken(
  value: { purpose: string; id: string; version: number; expiresAt: number },
  config: BackendConfig,
) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return body + '.' + createHmac('sha256', config.SESSION_SECRET).update(body).digest('base64url');
}
export function readSignedToken(value: string, purpose: string, config: BackendConfig) {
  const [body, signature, ...extra] = value.split('.');
  if (
    !body ||
    !signature ||
    extra.length ||
    !constantEqual(
      signature,
      createHmac('sha256', config.SESSION_SECRET).update(body).digest('base64url'),
    )
  )
    throw new Error('Token inválido.');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    purpose: string;
    id: string;
    version: number;
    expiresAt: number;
  };
  if (
    data.purpose !== purpose ||
    !data.id ||
    !Number.isInteger(data.version) ||
    data.expiresAt < Date.now()
  )
    throw new Error('Token inválido ou expirado.');
  return data;
}

import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type Transaction } from '@maos-em-oracao/database';
import type { Permission, Session } from '@maos-em-oracao/contracts';
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export function requireValue<T>(
  value: T | null | undefined,
  message = 'Registro não encontrado.',
): T {
  if (value == null) throw new DomainError('NOT_FOUND', message, 404);
  return value;
}
export type Actor = Session & {
  userId?: string;
  customerId?: string;
  guestOrderId?: string;
  owner: boolean;
};
export const permissions: Permission[] = [
  'orders',
  'subscriptions',
  'production',
  'shipping',
  'catalog',
  'customers',
  'finance',
  'support',
  'community',
  'marketing',
  'reports',
  'team',
  'settings',
];
export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new DomainError('UNAUTHORIZED', 'Entre na sua conta para continuar.', 401);
  return actor;
}
export function permit(actor: Actor | null, permission: Permission): Actor {
  const a = requireActor(actor);
  if (a.role === 'customer' || (!a.owner && !a.permissions.includes(permission)))
    throw new DomainError('FORBIDDEN', 'Seu perfil não permite esta operação.', 403);
  return a;
}
export function ownerOnly(actor: Actor | null): Actor {
  const a = requireActor(actor);
  if (!a.owner)
    throw new DomainError(
      'FORBIDDEN',
      'Somente o responsável pela loja pode alterar acessos e configurações.',
      403,
    );
  return a;
}
export const data = <T>(value: unknown): T => value as T;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
export const instant = (value: Date) => value.toISOString();
export const month = (value: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(value)
    .replace(/\//g, '-');
export function nextMonth(value: Date) {
  const result = new Date(value);
  const original = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const end = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(original, end));
  return result;
}
export const addDays = (days: number, from = new Date()) =>
  new Date(from.getTime() + days * 86400000);
export const uid = () => randomUUID();
export async function audit(
  db: PrismaClient | Transaction,
  actorId: string,
  action: string,
  entity: string,
  correlationId?: string,
) {
  await db.auditEntry.create({ data: { actorId, action, entity, correlationId } });
}
export function safeCsv(value: unknown) {
  const s = String(value ?? '');
  return '"' + (/^[\s]*[=+@\-\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"';
}

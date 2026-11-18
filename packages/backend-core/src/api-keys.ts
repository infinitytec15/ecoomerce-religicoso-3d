import { z } from 'zod';
import { permissionSchema, type Permission } from '@maos-em-oracao/contracts';
import type { Context } from './context';
import {
  addDays,
  audit,
  DomainError,
  ownerOnly,
  permissions as allPermissions,
  requireValue,
  type Actor,
} from './shared';
import { sessionHash, token } from './security';

/** Every key starts with this, so a leaked one is easy to spot in logs and secret scanners. */
export const API_KEY_PREFIX = 'meo_mcp_';
const MAX_ACTIVE_KEYS = 20;
/** `lastUsedAt` is refreshed at most this often, so each MCP call is not also a write. */
const USAGE_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export const apiKeyInputSchema = z
  .object({
    name: z.string().trim().min(3, 'Dê um nome com pelo menos 3 letras.').max(60),
    fullAccess: z.boolean().default(true),
    permissions: z.array(permissionSchema).max(allPermissions.length).default([]),
    expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  })
  .refine((v) => v.fullAccess || v.permissions.length > 0, {
    message: 'Escolha ao menos uma permissão para a chave.',
    path: ['permissions'],
  });

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  fullAccess: boolean;
  permissions: Permission[];
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

type ApiKeyRow = Awaited<ReturnType<Context['db']['apiKey']['findFirstOrThrow']>> & {
  user: { name: string };
};

const hashKey = (raw: string, ctx: Context) => sessionHash('api-key/' + raw, ctx.config);

function view(k: ApiKeyRow): ApiKeyView {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    fullAccess: k.fullAccess,
    permissions: k.permissions as Permission[],
    createdBy: k.user.name,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  };
}

/** Keys for the MCP endpoint: only the store owner creates, lists or revokes them. */
export class ApiKeysService {
  constructor(private ctx: Context) {}

  async list(actor: Actor | null): Promise<ApiKeyView[]> {
    ownerOnly(actor);
    const rows = await this.ctx.db.apiKey.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(view);
  }

  /** Returns the raw key once; afterwards only its hash exists. */
  async create(actor: Actor | null, value: unknown): Promise<{ key: string; apiKey: ApiKeyView }> {
    const a = ownerOnly(actor);
    if (a.apiKeyId)
      throw new DomainError('FORBIDDEN', 'Uma chave MCP não pode criar outras chaves.', 403);
    const input = apiKeyInputSchema.parse(value),
      now = new Date();
    const active = await this.ctx.db.apiKey.count({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
    if (active >= MAX_ACTIVE_KEYS)
      throw new DomainError(
        'API_KEY_LIMIT',
        `Revogue uma chave antes de criar outra (limite de ${MAX_ACTIVE_KEYS} ativas).`,
        409,
      );
    const raw = API_KEY_PREFIX + token();
    const row = await this.ctx.db.apiKey.create({
      data: {
        name: input.name,
        prefix: raw.slice(0, API_KEY_PREFIX.length + 6),
        keyHash: hashKey(raw, this.ctx),
        userId: requireValue(a.userId, 'Usuário não encontrado.'),
        fullAccess: input.fullAccess,
        permissions: input.fullAccess ? [] : [...new Set(input.permissions)],
        expiresAt: input.expiresInDays ? addDays(input.expiresInDays, now) : null,
      },
      include: { user: { select: { name: true } } },
    });
    await audit(this.ctx.db, a.id, 'Chave MCP criada', 'api-key/' + row.id);
    return { key: raw, apiKey: view(row) };
  }

  async revoke(actor: Actor | null, id: string): Promise<void> {
    const a = ownerOnly(actor);
    z.string().uuid('Chave não encontrada.').parse(id);
    const changed = await this.ctx.db.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!changed.count)
      requireValue(await this.ctx.db.apiKey.findUnique({ where: { id } }), 'Chave não encontrada.');
    await audit(this.ctx.db, a.id, 'Chave MCP revogada', 'api-key/' + id);
  }

  /**
   * The team member a key acts as, or null when the key is unknown, revoked, expired or its
   * creator lost access. A key never grants more than its creator holds right now.
   */
  async actor(raw: string | undefined | null): Promise<Actor | null> {
    if (!raw || !raw.startsWith(API_KEY_PREFIX) || raw.length > 128) return null;
    const k = await this.ctx.db.apiKey.findUnique({
      where: { keyHash: hashKey(raw, this.ctx) },
      include: { user: true },
    });
    const now = new Date();
    if (!k || k.revokedAt || (k.expiresAt && k.expiresAt <= now)) return null;
    const u = k.user;
    if (!u.enabled || u.role === 'customer') return null;
    const held = (u.owner ? allPermissions : u.permissions) as Permission[];
    if (!k.lastUsedAt || now.getTime() - k.lastUsedAt.getTime() > USAGE_WRITE_INTERVAL_MS)
      await this.ctx.db.apiKey
        .update({ where: { id: k.id }, data: { lastUsedAt: now } })
        .catch(() => undefined);
    return {
      id: u.id,
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role as Actor['role'],
      permissions: k.fullAccess
        ? held
        : (k.permissions as Permission[]).filter((p) => held.includes(p)),
      owner: u.owner && k.fullAccess,
      demo: false,
      apiKeyId: k.id,
    };
  }
}

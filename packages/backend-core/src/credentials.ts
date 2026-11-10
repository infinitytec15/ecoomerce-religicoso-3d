import { transaction, lock } from '@maos-em-oracao/database';
import { z } from 'zod';
import type { Context } from './context';
import { ownerOnly, requireValue, DomainError, audit, type Actor } from './shared';
import { token, digest, seal, unseal } from './security';
interface OAuthToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export class ShippingCredentials {
  constructor(private ctx: Context) {}
  async access() {
    const c = this.ctx.config,
      row = await this.ctx.db.integrationCredential.findUnique({
        where: { provider: 'melhor-envio' },
      });
    if (!row) return c.ME_ACCESS_TOKEN;
    const current = unseal<OAuthToken>(row.encrypted, c);
    if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 300000)
      return current.access_token;
    const lockValue = token(),
      locked = await this.ctx.redis.set('meo:oauth:melhor-envio', lockValue, 'PX', 30000, 'NX');
    if (!locked) {
      if (row.expiresAt > new Date()) return current.access_token;
      throw new DomainError(
        'SHIPPING_REFRESH_PENDING',
        'A conexão de frete está sendo renovada. Tente novamente.',
        503,
      );
    }
    try {
      const fresh = await this.ctx.shipping.token({ refreshToken: current.refresh_token });
      await this.ctx.db.integrationCredential.update({
        where: { provider: 'melhor-envio' },
        data: {
          encrypted: seal(fresh, c),
          expiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        },
      });
      return fresh.access_token;
    } finally {
      await this.ctx.redis.eval(
        'if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) end return 0',
        1,
        'meo:oauth:melhor-envio',
        lockValue,
      );
    }
  }
  async authorize(actor: Actor | null) {
    const a = ownerOnly(actor),
      state = token();
    await this.ctx.db.emailToken.create({
      data: {
        tokenHash: digest(state),
        userId: a.userId,
        purpose: 'melhor-envio-oauth',
        data: { actorId: a.id },
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { url: this.ctx.shipping.authorizationUrl(state) };
  }
  async callback(value: unknown) {
    const input = z
        .object({ code: z.string().min(1).max(2000), state: z.string().min(30).max(200) })
        .parse(value),
      state = requireValue(
        await this.ctx.db.emailToken.findUnique({
          where: { tokenHash: digest(input.state) },
          include: { user: true },
        }),
      );
    if (
      state.purpose !== 'melhor-envio-oauth' ||
      state.usedAt ||
      state.expiresAt < new Date() ||
      !state.user?.owner ||
      !state.user.enabled
    )
      throw new DomainError(
        'INVALID_STATE',
        'A autorização expirou. Inicie a conexão novamente.',
        401,
      );
    const fresh = await this.ctx.shipping.token({ code: input.code });
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'oauth-state/' + state.id);
      const again = requireValue(await tx.emailToken.findUnique({ where: { id: state.id } }));
      if (again.usedAt)
        throw new DomainError('STATE_USED', 'Esta autorização já foi utilizada.', 409);
      await tx.integrationCredential.upsert({
        where: { provider: 'melhor-envio' },
        create: {
          provider: 'melhor-envio',
          encrypted: seal(fresh, this.ctx.config),
          expiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        },
        update: {
          encrypted: seal(fresh, this.ctx.config),
          expiresAt: new Date(Date.now() + fresh.expires_in * 1000),
        },
      });
      await tx.emailToken.update({ where: { id: state.id }, data: { usedAt: new Date() } });
      await audit(tx, state.user!.id, 'Melhor Envio conectado', 'melhor-envio');
    });
    return this.ctx.config.PUBLIC_WEB_URL + '/admin/configuracoes?frete=conectado';
  }
}

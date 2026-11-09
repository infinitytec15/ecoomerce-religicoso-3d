import { describe, it, expect } from 'vitest';
import { DemoGateway } from './gateway';
import { MemoryDemoStorage, BrowserDemoStorage } from './storage';
import { createSeed, DEMO_EMAIL, DEMO_PASSWORD } from './seed';
const login = { kind: 'staff' as const, email: DEMO_EMAIL, password: DEMO_PASSWORD };
async function setup() {
  const storage = new MemoryDemoStorage(),
    gateway = new DemoGateway(storage);
  await gateway.login(login);
  return { gateway, storage };
}
describe('admin operation workflows', () => {
  it('preserves existing records when upgrading the persisted operation', () => {
    const state = createSeed();
    const legacy = {
      ...state,
      workspace: undefined,
      invitations: undefined,
      editions: undefined,
      stockMovements: undefined,
      coupons: undefined,
    };
    localStorage.setItem('meo-commerce-v2', JSON.stringify(legacy));
    const result = new BrowserDemoStorage().load();
    expect(result.orders).toEqual(state.orders);
    expect(result.workspace.shippingProvider).toBe('melhor-envio');
    expect(result.editions).toHaveLength(1);
    localStorage.removeItem('meo-commerce-v2');
  });
  it('rejects negative stock atomically and records an adjustment reason', async () => {
    const { gateway: g } = await setup(),
      p = (await g.admin()).products[0];
    await expect(
      g.adminCommand({
        type: 'stock.adjust',
        productId: p.id,
        delta: -p.stock - 1,
        reason: 'Conferência',
      }),
    ).rejects.toThrow();
    expect((await g.admin()).products[0].stock).toBe(p.stock);
    await g.adminCommand({
      type: 'stock.adjust',
      productId: p.id,
      delta: 3,
      reason: 'Entrada da produção',
    });
    expect((await g.admin()).stockMovements[0].delta).toBe(3);
    expect((await g.admin()).products[0].stock).toBe(p.stock + 3);
  });
  it('archives without deleting order history, and rejects duplicate SKUs', async () => {
    const { gateway: g } = await setup(),
      s = await g.admin();
    await expect(
      g.adminCommand({
        type: 'product.save',
        product: { ...s.products[1], sku: s.products[0].sku },
      }),
    ).rejects.toThrow();
    await g.adminCommand({ type: 'product.archive', id: s.products[0].id });
    expect((await g.catalog()).some((p) => p.id === s.products[0].id)).toBe(false);
    expect((await g.admin()).orders).toEqual(s.orders);
  });
  it('accepts an invitation once, preserves permissions and blocks unrelated actions', async () => {
    const { gateway: g } = await setup();
    await g.adminCommand({
      type: 'invite.create',
      name: 'Pessoa de teste',
      email: 'convite@example.test',
      role: 'support',
      permissions: ['support'],
    });
    const invite = (await g.admin()).invitations[0];
    await g.acceptInvitation({ token: invite.token, name: 'Pessoa de teste' });
    expect((await g.session())?.role).toBe('support');
    await expect(g.invitation(invite.token)).rejects.toThrow();
    await expect(
      g.adminCommand({ type: 'product.archive', id: 'cruz-essencial' }),
    ).rejects.toThrow();
  });
  it('revokes and expires invitations before acceptance', async () => {
    const { gateway: g, storage } = await setup();
    await g.adminCommand({
      type: 'invite.create',
      name: 'Pessoa de teste',
      email: 'convite@example.test',
      role: 'finance',
      permissions: ['finance'],
    });
    const invite = (await g.admin()).invitations[0];
    await g.adminCommand({ type: 'invite.revoke', id: invite.id });
    await expect(g.invitation(invite.token)).rejects.toThrow();
    await g.adminCommand({ type: 'invite.resend', id: invite.id });
    const s = storage.load();
    s.invitations[0].expiresAt = '2020-01-01';
    storage.save(s);
    await expect(
      g.acceptInvitation({ token: s.invitations[0].token, name: 'Pessoa' }),
    ).rejects.toThrow();
  });
  it('keeps internal support notes outside customer responses', async () => {
    const { gateway: g } = await setup();
    await g.login({ kind: 'customer', email: 'nota@example.test', password: 'demo' });
    await g.createTicket({
      subject: 'Meu pedido',
      category: 'Pedido',
      message: 'Gostaria de acompanhar meu pedido.',
    });
    const id = (await g.account()).tickets[0].id;
    await g.login(login);
    await g.adminCommand({
      type: 'ticket.reply',
      id,
      message: 'INTERNAL_ONLY',
      internal: true,
      status: 'Em atendimento',
      assignee: 'Equipe',
    });
    expect((await g.admin()).tickets[0].messages.at(-1)?.internal).toBe(true);
    await g.login({ kind: 'customer', email: 'nota@example.test', password: 'demo' });
    expect(JSON.stringify(await g.account())).not.toContain('INTERNAL_ONLY');
  });
  it('activates an edition without rewriting existing order items', async () => {
    const { gateway: g } = await setup(),
      s = await g.admin();
    await g.adminCommand({
      type: 'edition.save',
      edition: {
        ...s.editions[0],
        id: 'next',
        name: 'Novo mês',
        month: '2026-12',
        status: 'Rascunho',
      },
    });
    await g.adminCommand({ type: 'edition.activate', id: 'next' });
    expect((await g.admin()).settings.edition).toBe('Novo mês');
    expect((await g.admin()).orders).toEqual(s.orders);
  });
  it('requires preparation before generating a demonstration shipping label', async () => {
    const { gateway: g } = await setup(),
      order = (await g.admin()).orders.find((o) => o.status === 'Pronto para envio')!;
    await expect(
      g.adminCommand({ type: 'shipping.label', id: order.id, action: 'generate' }),
    ).rejects.toThrow();
    await g.adminCommand({ type: 'shipping.label', id: order.id, action: 'prepare' });
    await g.adminCommand({ type: 'shipping.label', id: order.id, action: 'generate' });
    expect((await g.admin()).orders.find((o) => o.id === order.id)?.labelStatus).toBe('Gerada');
  });
  it('does not expose prayer moderation notes or reports in the public mural', async () => {
    const { gateway: g } = await setup(),
      p = (await g.admin()).prayers[0];
    await g.adminCommand({
      type: 'prayer.review',
      id: p.id,
      status: 'Publicado',
      note: 'PRIVATE_NOTE',
    });
    await g.reportPrayer(p.id, 'Revisar conteúdo');
    const publicPrayer = (await g.community()).find((x) => x.id === p.id)!;
    expect(publicPrayer.moderationNote).toBeUndefined();
    expect(publicPrayer.reports).toBeUndefined();
    expect((await g.admin()).prayers[0].reports).toHaveLength(1);
  });
});

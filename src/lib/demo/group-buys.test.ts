import { describe, it, expect } from 'vitest';
import type { CheckoutInput } from '@/lib/domain/types';
import { demoAddress } from '@/lib/domain/schemas';
import { DemoGateway } from './gateway';
import { MemoryDemoStorage } from './storage';
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed';

const staff = { email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' as const };
const joinInput = (
  productId: string,
  groupBuyId: string | undefined,
  patch: Partial<CheckoutInput> = {},
): CheckoutInput => ({
  items: [{ productId, quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' }],
  address: { ...demoAddress, email: 'grupo-' + crypto.randomUUID() + '@exemplo.com' },
  shipping: 'standard',
  coupon: '',
  payment: 'card',
  pixCents: 0,
  installments: 1,
  consent: true,
  idempotencyKey: crypto.randomUUID(),
  groupBuyId,
  ...patch,
});
const saveInput = (productId: string, patch: Record<string, unknown> = {}) =>
  ({
    type: 'groupbuy.save',
    title: 'Campanha nova',
    description: '',
    productId,
    sizeIndex: 0,
    groupPriceCents: 1000,
    goal: 5,
    maxParticipants: null,
    perPersonLimit: 2,
    mode: 'hold',
    endsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    active: true,
    ...patch,
  }) as never;

describe('demo group buys', () => {
  it('lists the seeded campaign and attaches it to its product', async () => {
    const g = new DemoGateway(),
      [gb, ...others] = await g.groupBuys();
    expect(others).toHaveLength(0);
    expect(gb).toMatchObject({
      id: 'grupo-demo',
      title: 'Compra coletiva de Natal',
      mode: 'difference',
      sizeIndex: 0,
      goal: 10,
      participants: 7,
      remaining: 3,
      perPersonLimit: 2,
      status: 'Aberta',
      initials: ['MS', 'JP', 'AC', 'LR', 'FB', 'TC', 'RM'],
    });
    expect(gb.groupPriceCents).toBe(gb.normalPriceCents - 2000);
    expect(gb).not.toHaveProperty('costCents');
    expect(await g.groupBuy('grupo-demo')).toEqual(gb);
    const product = await g.product(gb.productId);
    expect(product?.groupBuy).toMatchObject({ id: 'grupo-demo', participants: 7 });
    expect((await g.catalog()).find((p) => p.id === gb.productId)?.groupBuy?.id).toBe('grupo-demo');
    await expect(g.groupBuy('nao-existe')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a coupon, other items and a closed campaign in checkout and estimate', async () => {
    const g = new DemoGateway(),
      gb = (await g.groupBuys())[0];
    await expect(
      g.checkout(joinInput(gb.productId, gb.id, { coupon: 'PRIMEIRAFE' })),
    ).rejects.toMatchObject({ code: 'COUPON_NOT_ALLOWED', status: 422 });
    await expect(
      g.checkout(
        joinInput(gb.productId, gb.id, {
          items: [
            { productId: gb.productId, quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' },
            { productId: gb.productId, quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_SINGLE_ITEM' });
    await expect(
      g.checkout(
        joinInput(gb.productId, gb.id, {
          items: [
            { productId: gb.productId, quantity: 1, color: 'Marfim', sizeIndex: 1, dedication: '' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_ITEM' });
    await expect(
      g.checkout(
        joinInput(gb.productId, gb.id, {
          items: [
            {
              productId: 'palavra-fe',
              quantity: 1,
              color: 'Terracota',
              sizeIndex: 0,
              dedication: '',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_ITEM' });
    await expect(
      g.checkout(
        joinInput(gb.productId, gb.id, {
          items: [
            { productId: gb.productId, quantity: 3, color: 'Marfim', sizeIndex: 0, dedication: '' },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_LIMIT', status: 422 });
    await expect(
      g.estimate({
        items: joinInput(gb.productId, gb.id).items,
        coupon: 'PRIMEIRAFE',
        groupBuyId: gb.id,
      }),
    ).rejects.toMatchObject({ code: 'COUPON_NOT_ALLOWED' });
    await expect(g.checkout(joinInput(gb.productId, 'inexistente'))).rejects.toMatchObject({
      code: 'GROUP_BUY_CLOSED',
      status: 409,
    });
  });

  it('charges the normal price until the goal in difference mode, then counts the participant', async () => {
    const g = new DemoGateway(),
      gb = (await g.groupBuys())[0],
      input = joinInput(gb.productId, gb.id);
    const estimate = await g.estimate({ items: input.items, coupon: '', groupBuyId: gb.id });
    expect(estimate.items[0].unitCents).toBe(gb.normalPriceCents);
    const result = await g.checkout(input);
    const after = (await g.groupBuys())[0];
    expect(after.participants).toBe(8);
    expect(after.remaining).toBe(2);
    expect(after.initials).toHaveLength(8);
    const order = (await g.account()).orders.find((o) => o.id === result.orderId)!;
    expect(order.items[0].unitCents).toBe(gb.normalPriceCents);
    expect(order.status).toBe('Confirmado');
    // The same customer buying again does not add a participant.
    await g.checkout({ ...input, idempotencyKey: crypto.randomUUID() });
    expect((await g.groupBuys())[0].participants).toBe(8);
    await expect(
      g.checkout({ ...input, idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_LIMIT' });
  });

  it('pays the group price from the goal on, and a Pix participant only counts once paid', async () => {
    const g = new DemoGateway(),
      gb = (await g.groupBuys())[0];
    for (let i = 0; i < 3; i++) await g.checkout(joinInput(gb.productId, gb.id));
    const reached = (await g.groupBuys())[0];
    expect(reached).toMatchObject({ status: 'Meta atingida', goalReached: true, remaining: 0 });
    const pix = await g.checkout(joinInput(gb.productId, gb.id, { payment: 'pix' }));
    expect((await g.account()).orders.find((o) => o.id === pix.orderId)?.items[0].unitCents).toBe(
      gb.groupPriceCents,
    );
    expect((await g.groupBuys())[0].participants).toBe(10);
    const account = await g.account();
    await g.confirmDemoPayment(account.charges.find((c) => c.orderId === pix.orderId)!.id);
    expect((await g.groupBuys())[0].participants).toBe(11);
  });

  it('holds paid orders in hold mode until the goal is reached', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage),
      statusOf = (id: string) => storage.load().orders.find((o) => o.id === id);
    await g.login(staff);
    const product = (await g.groupBuys())[0].productId;
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    await g.adminCommand(saveInput(product, { goal: 2, mode: 'hold' }));
    const hold = (await g.groupBuys())[0];
    expect(hold.mode).toBe('hold');
    const first = await g.checkout(joinInput(product, hold.id));
    expect(statusOf(first.orderId)).toMatchObject({ status: 'Aguardando grupo' });
    expect(statusOf(first.orderId)?.items[0].unitCents).toBe(1000);
    expect((await g.groupBuys())[0].participants).toBe(1);
    const second = await g.checkout(joinInput(product, hold.id));
    expect((await g.groupBuys())[0]).toMatchObject({ participants: 2, status: 'Meta atingida' });
    expect(statusOf(second.orderId)?.status).toBe('Confirmado');
    expect(statusOf(first.orderId)?.status).toBe('Confirmado');
  });

  it('never sends a held order to production', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login(staff);
    const product = (await g.groupBuys())[0].productId;
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    await g.adminCommand(saveInput(product, { goal: 5, mode: 'hold' }));
    const held = await g.checkout(joinInput(product, (await g.groupBuys())[0].id));
    await g.login(staff);
    await expect(
      g.adminCommand({ type: 'orders.batch', ids: [held.orderId], action: 'production' }),
    ).rejects.toMatchObject({ code: 'GROUP_PENDING', status: 409 });
  });

  it('cancels held orders when a hold campaign closes without the goal', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login(staff);
    const product = (await g.groupBuys())[0].productId;
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    await g.adminCommand(saveInput(product, { goal: 5, mode: 'hold' }));
    const held = await g.checkout(joinInput(product, (await g.groupBuys())[0].id));
    await g.login(staff);
    await g.adminCommand({ type: 'groupbuy.close', id: (await g.groupBuys())[0].id });
    expect(storage.load().orders.find((o) => o.id === held.orderId)?.status).toBe('Cancelado');
  });

  it('closes a campaign for good as "Não fechou" when the goal was not reached', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    expect(await g.groupBuys()).toHaveLength(0);
    await expect(g.groupBuy('grupo-demo')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const admin = (await g.admin()).groupBuys.find((x) => x.id === 'grupo-demo');
    expect(admin?.status).toBe('Não fechou');
    await expect(
      g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' }),
    ).rejects.toMatchObject({ code: 'GROUP_BUY_CLOSED' });
  });

  it('validates the price, allows one open campaign per product and extends the deadline', async () => {
    const g = new DemoGateway();
    await g.login(staff);
    const product = (await g.groupBuys())[0].productId;
    await expect(g.adminCommand(saveInput(product))).rejects.toMatchObject({
      code: 'GROUP_BUY_EXISTS',
      status: 409,
    });
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    await expect(
      g.adminCommand(saveInput(product, { groupPriceCents: 99_999_00 })),
    ).rejects.toMatchObject({ code: 'GROUP_PRICE_NOT_LOWER', status: 422 });
    await g.adminCommand(saveInput(product));
    const created = (await g.groupBuys())[0];
    const later = new Date(Date.parse(created.endsAt) + 86400000).toISOString();
    await g.adminCommand({ type: 'groupbuy.extend', id: created.id, endsAt: later });
    expect((await g.groupBuys())[0].endsAt).toBe(later);
    await expect(
      g.adminCommand({ type: 'groupbuy.extend', id: created.id, endsAt: created.endsAt }),
    ).rejects.toMatchObject({ code: 'INVALID_END' });
  });

  it('requires the marketing permission for groupbuy commands', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    storage.saveSession({
      id: 's',
      name: 'Suporte',
      email: 'suporte@exemplo.com',
      role: 'support',
      permissions: ['orders'],
      demo: true,
    });
    await expect(
      g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    storage.saveSession({
      id: 's',
      name: 'Marketing',
      email: 'mkt@exemplo.com',
      role: 'support',
      permissions: ['marketing'],
      demo: true,
    });
    await g.adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' });
    expect(await g.groupBuys()).toHaveLength(0);
  });
});

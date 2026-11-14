import { describe, it, expect } from 'vitest';
import { DemoGateway } from './gateway';
import { BrowserDemoStorage, MemoryDemoStorage } from './storage';
import { createSeed, DEMO_EMAIL, DEMO_PASSWORD } from './seed';
import legacy from '@/data/legacy-seed.json';
import { demoAddress } from '@/lib/domain/schemas';
const customerLogin = {
  email: 'cliente-novo@exemplo.com',
  password: 'ficticia',
  kind: 'customer' as const,
};
describe('demo gateway workflows', () => {
  it('keeps internal product costs out of the public catalog', async () => {
    const gateway = new DemoGateway();
    expect((await gateway.catalog())[0]).not.toHaveProperty('costCents');
    await gateway.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    expect((await gateway.admin()).products[0].costCents).toBeGreaterThan(0);
  });
  it('isolates customer records and rejects staff actions for a customer', async () => {
    const gateway = new DemoGateway();
    await expect(gateway.admin()).rejects.toThrow();
    await gateway.login(customerLogin);
    expect((await gateway.account()).orders).toHaveLength(0);
    await expect(
      gateway.adminCommand({ type: 'customer.archive', id: 'anything' }),
    ).rejects.toThrow();
  });
  it('creates a subscription once, confirms Pix and exposes it in the account', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage),
      input = {
        profile: 'Cristã' as const,
        finish: 'Marfim',
        address: { ...demoAddress, email: 'assinante-novo@exemplo.com' },
        payment: 'pix' as const,
        consent: true,
        idempotencyKey: crypto.randomUUID(),
      };
    const result = await g.subscribe(input);
    expect(await g.subscribe(input)).toEqual(result);
    let account = await g.account();
    expect(account.subscriptions).toHaveLength(1);
    expect(account.subscriptions[0].status).toBe('Pagamento pendente');
    await g.confirmDemoPayment(account.charges[0].id);
    account = await g.account();
    expect(account.subscriptions[0].status).toBe('Ativa');
    await g.changeSubscription({ id: result.subscriptionId!, action: 'pause' });
    expect((await g.account()).subscriptions[0].status).toBe('Pausada');
    await g.changeSubscription({ id: result.subscriptionId!, action: 'resume' });
    await g.changeSubscription({ id: result.subscriptionId!, action: 'cancel', reason: 'Teste' });
    expect((await g.account()).subscriptions[0].status).toBe('Cancelada');
  });
  it('switches a staff shopper into the customer checkout session', async () => {
    const g = new DemoGateway();
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    const result = await g.checkout({
      items: [
        { productId: 'cruz-essencial', quantity: 1, color: 'Marfim', sizeIndex: 0, dedication: '' },
      ],
      address: demoAddress,
      shipping: 'standard',
      coupon: '',
      payment: 'card',
      pixCents: 0,
      installments: 1,
      consent: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await g.session())?.role).toBe('customer');
    expect((await g.account()).orders.some((o) => o.id === result.orderId)).toBe(true);
  });
  it('keeps replies connected across the customer and admin views', async () => {
    const g = new DemoGateway();
    await g.login(customerLogin);
    await g.createTicket({
      subject: 'Minha entrega',
      category: 'Entrega',
      message: 'Quero saber o prazo do meu pedido.',
    });
    const ticket = (await g.account()).tickets[0];
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    await g.adminCommand({
      type: 'ticket.reply',
      id: ticket.id,
      message: 'Vamos acompanhar sua entrega.',
      status: 'Em atendimento',
      assignee: 'Camila',
    });
    await g.login(customerLogin);
    expect((await g.account()).tickets[0].messages.at(-1)?.by).toBe('equipe');
  });
  it('never stores the supplied demo password', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login({ ...customerLogin, password: 'NEVER_STORE_THIS' });
    expect(JSON.stringify(storage.load()) + JSON.stringify(storage.session())).not.toContain(
      'NEVER_STORE_THIS',
    );
  });
  it('moderates community requests without deleting them', async () => {
    const g = new DemoGateway();
    await g.postPrayer({
      name: '',
      title: 'Por um novo caminho',
      message: 'Peço oração por serenidade e esperança.',
      category: 'Fé',
      anonymous: true,
      consent: true,
    });
    const prayer = (await g.community())[0];
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    await g.adminCommand({ type: 'prayer.review', id: prayer.id, status: 'Publicado', note: '' });
    await g.reactPrayer(prayer.id);
    expect((await g.community())[0].reactions).toBe(1);
    await g.reactPrayer(prayer.id);
    expect((await g.community())[0].reactions).toBe(0);
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    await g.adminCommand({ type: 'prayer.moderate', id: prayer.id });
    expect((await g.community()).some((p) => p.id === prayer.id)).toBe(false);
    expect((await g.admin()).prayers.some((p) => p.id === prayer.id)).toBe(true);
  });
});
describe('legacy storage migration', () => {
  it('converts reais to cents without changing or deleting the original records', () => {
    const original = JSON.stringify(legacy.operations);
    localStorage.setItem('amago-operations-v1', original);
    const state = new BrowserDemoStorage().load();
    expect(state.version).toBe(2);
    expect(state.orders[0].totalCents).toBe(Math.round(legacy.operations.orders[0].total * 100));
    expect(localStorage.getItem('amago-operations-v1')).toBe(original);
    expect(localStorage.getItem('meo-commerce-v2')).toBeTruthy();
  });
  it('preserves public prayers and reactions from the original prototype', () => {
    localStorage.setItem(
      'amago-prayers',
      JSON.stringify([
        {
          id: 'old',
          name: 'Ana',
          title: 'Pela família',
          message: 'Paz para nossa casa.',
          category: 'Família',
          anonymous: false,
        },
      ]),
    );
    localStorage.setItem('amago-prayed', '["old"]');
    const prayer = new BrowserDemoStorage().load().prayers[0];
    expect(prayer.id).toBe('old');
    expect(prayer.prayed).toBe(true);
    expect(prayer.reactions).toBe(1);
  });
  it('does not re-login a legacy session after explicit logout', () => {
    sessionStorage.setItem('amago-admin-session', '{"demo":true}');
    const storage = new BrowserDemoStorage();
    expect(storage.session()?.role).toBe('admin');
    storage.saveSession(null);
    expect(storage.session()).toBeNull();
  });
  it('uses a clean fallback for corrupt data without deleting the original', () => {
    localStorage.setItem('amago-operations-v1', '{corrupt');
    expect(new BrowserDemoStorage().load().products).toHaveLength(createSeed().products.length);
    expect(localStorage.getItem('amago-operations-v1')).toBe('{corrupt');
  });
});

describe('demo reviews', () => {
  const demoCustomer = {
    email: 'ana@exemplo.com',
    password: 'demonstracao',
    kind: 'customer' as const,
  };
  const reviewable = async (g: DemoGateway) => {
    const account = await g.account();
    const order = account.orders.find((o) => o.status === 'Entregue');
    return requireDefined(order?.items[0]?.itemId);
  };
  const requireDefined = <T>(value: T | undefined): T => {
    expect(value).toBeDefined();
    return value as T;
  };
  it('seeds three published reviews on the first product with a 4.7 average', async () => {
    const g = new DemoGateway();
    const [first] = await g.catalog();
    expect(first.rating).toEqual({ average: 4.7, count: 3 });
    const { summary, reviews } = await g.productReviews(first.id);
    expect(summary).toMatchObject({ average: 4.7, count: 3, histogram: [0, 0, 0, 1, 2] });
    expect(reviews).toHaveLength(3);
    expect(reviews.some((r) => r.reply)).toBe(true);
    expect((await g.catalog()).slice(1).every((p) => p.rating === undefined)).toBe(true);
  });
  it('lets the demo customer review a delivered item once and queues it for moderation', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login(demoCustomer);
    const orderItemId = await reviewable(g);
    const input = {
      orderItemId,
      rating: 5,
      title: 'Linda',
      text: 'Ficou linda na sala.',
      photoIds: [],
    };
    const mine = await g.createReview(input, 'k1');
    expect(mine).toEqual({ orderItemId, rating: 5, status: 'Em análise' });
    expect((await g.account()).reviews).toEqual([mine]);
    await expect(g.createReview(input, 'k2')).rejects.toMatchObject({
      code: 'ALREADY_REVIEWED',
      status: 409,
    });
    const [first] = await g.catalog();
    expect((await g.productReviews(first.id)).reviews).toHaveLength(3);
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    const pending = (await g.admin()).reviews.find((r) => r.status === 'Em análise');
    expect(pending).toMatchObject({ rating: 5, author: 'Ana F.', productId: first.id });
    await g.adminCommand({
      type: 'review.moderate',
      id: requireDefined(pending).id,
      status: 'Publicado',
      reply: 'Obrigada!',
    });
    const published = await g.productReviews(first.id);
    expect(published.summary.count).toBe(4);
    expect(published.reviews[0]).toMatchObject({ reply: 'Obrigada!' });
  });
  it('rejects reviews for items that are not in the customer’s orders', async () => {
    const g = new DemoGateway();
    await g.login(demoCustomer);
    await expect(
      g.createReview(
        {
          orderItemId: 'PED-4001~0',
          rating: 5,
          title: '',
          text: 'Texto longo o bastante.',
          photoIds: [],
        },
        'k',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
  it('filters the list by rating but keeps the full summary', async () => {
    const g = new DemoGateway();
    const [first] = await g.catalog();
    const only4 = await g.productReviews(first.id, 4);
    expect(only4.reviews.map((r) => r.rating)).toEqual([4]);
    expect(only4.summary.count).toBe(3);
  });
  it('never lists hidden reviews', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    const [first] = await g.catalog();
    const target = (await g.admin()).reviews[0];
    await g.adminCommand({ type: 'review.moderate', id: target.id, status: 'Oculto', reply: '' });
    const after = await g.productReviews(first.id);
    expect(after.reviews.some((r) => r.id === target.id)).toBe(false);
    expect(after.summary.count).toBe(2);
  });
  it('serves the demo kit with a positive saving and hides it when a component is inactive', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    const kit = (await g.catalog()).find((p) => p.kit)!;
    expect(kit.kitSummary!.savingsCents).toBeGreaterThan(0);
    expect(kit.kitSummary!.pieces).toBe(3);
    const state = storage.load();
    state.products.find((p) => p.id === 'palavra-fe')!.active = false;
    storage.save(state);
    expect((await g.catalog()).some((p) => p.kit)).toBe(false);
    expect(await g.product(kit.id)).toBeNull();
  });
  it('normalizes a saved kit and rejects invalid ones', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    const base = storage.load().products.find((p) => p.kit)!;
    const save = (kit: unknown, extra = {}) =>
      g.adminCommand({
        type: 'product.save',
        product: { ...base, ...extra, kit } as never,
      });
    await save(base.kit, { stock: 7, sizes: ['x'], sizePrices: [100], costCents: 1 });
    const saved = storage.load().products.find((p) => p.id === base.id)!;
    expect(saved).toMatchObject({ sizes: ['Kit completo'], colors: ['Padrão'], stock: 0 });
    expect(saved.sizePrices).toBeUndefined();
    expect(saved.costCents).toBeGreaterThan(1);
    await expect(
      save({ components: [{ productId: 'nao-existe', sizeIndex: 0, color: null, quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'INVALID_KIT' });
    await expect(
      save({ components: [{ productId: base.id, sizeIndex: 0, color: null, quantity: 2 }] }),
    ).rejects.toMatchObject({ code: 'INVALID_KIT' });
  });
  it('rejects a kit in a manual order', async () => {
    const storage = new MemoryDemoStorage(),
      g = new DemoGateway(storage);
    await g.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, kind: 'staff' });
    const state = storage.load();
    await expect(
      g.adminCommand({
        type: 'order.create',
        customerId: state.clients[0].id,
        productId: state.products.find((p) => p.kit)!.id,
        quantity: 1,
        shippingCents: 0,
      } as never),
    ).rejects.toMatchObject({ code: 'KIT_NOT_ALLOWED' });
  });
});

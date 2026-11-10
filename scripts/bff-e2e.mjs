// End-to-end smoke of the store and admin through the Next.js BFF, using the
// same HttpGateway and response schemas as the browser. Local mock backend only.
// Usage: node --env-file=.env.backend.local --import tsx scripts/bff-e2e.mjs [webOrigin]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HttpClient, HttpGateway } from '../src/lib/api/http.ts';

const web = process.argv[2] || process.env.PUBLIC_WEB_URL || 'http://127.0.0.1:8888';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(web), 'Use only a local web origin.');

function gatewayWithJar() {
  const jar = new Map();
  const fetcher = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('origin', web);
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const response = await fetch(new URL(url, web), { ...init, headers });
    for (const c of response.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const value = pair.slice(i + 1);
      if (value) jar.set(pair.slice(0, i), value);
      else jar.delete(pair.slice(0, i));
    }
    return response;
  };
  return new HttpGateway(new HttpClient('/api/v1', fetcher));
}

const results = [];
async function step(name, fn) {
  try {
    const value = await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
    return value;
  } catch (error) {
    results.push({ name, ok: false });
    console.log('FAIL', name, '→', error?.code || '', error?.status || '', error?.message);
    return undefined;
  }
}

const g = gatewayWithJar();
const address = {
  name: 'Cliente Teste QA',
  email: `cliente.qa+${Date.now()}@exemplo.com`,
  phone: '11999990000',
  cep: '01001-000',
  street: 'Praça da Sé',
  number: '100',
  extra: '',
  district: 'Sé',
  city: 'São Paulo',
  state: 'SP',
  document: '52998224725',
};
const password = 'Cliente!' + randomUUID();

await step('loja: configurações públicas', () => g.settings());
const products = await step('catálogo: lista produtos', async () => {
  const list = await g.catalog();
  assert.ok(list.length > 0, 'catálogo vazio');
  return list;
});
await step('catálogo: busca e filtro', () => g.catalog({ category: 'Católicos', search: 'cruz' }));
const product = products?.[0];
await step('produto: detalhe', async () => assert.ok(await g.product(product.id)));
await step('conta: cadastro de cliente', () =>
  g.login({ email: address.email, password, kind: 'customer', name: address.name, register: true }),
);
await step('conta: sessão ativa', async () =>
  assert.equal((await g.session())?.email, address.email),
);
await step('conta: snapshot', () => g.account());
await step('conta: atualizar perfil e endereço', () =>
  g.updateProfile({ name: address.name, email: address.email, address }),
);
const item = {
  productId: product.id,
  quantity: 1,
  color: product.colors[0],
  sizeIndex: 0,
  dedication: '',
};
const quotes = await step('frete: cotação por CEP', async () => {
  const q = await g.shipping(address.cep, [
    { productId: item.productId, quantity: 1, sizeIndex: 0 },
  ]);
  assert.ok(q.length > 0, 'nenhuma cotação');
  return q;
});
const quote = quotes?.[0];
await step('carrinho: estimativa com frete', () =>
  g.estimate({ items: [item], coupon: '', cep: address.cep, shippingQuoteId: quote?.quoteId }),
);
const order = await step('checkout: pedido com Pix', () =>
  g.checkout({
    items: [item],
    address,
    shipping: quote.quoteId || quote.id,
    shippingQuoteId: quote.quoteId,
    shippingServiceId: quote.serviceId,
    coupon: '',
    payment: 'pix',
    pixCents: 0,
    installments: 1,
    consent: true,
    idempotencyKey: randomUUID(),
  }),
);
await step('checkout: status do pagamento', () => g.payment(order.orderId));
await step('conta: pedido aparece na conta', async () => {
  const a = await g.account();
  assert.ok(a.orders.some((o) => o.id === order.orderId));
});
await step('clube: assinatura com Pix', () =>
  g.subscribe({
    profile: 'Católica',
    finish: 'Marfim',
    address,
    payment: 'pix',
    consent: true,
    idempotencyKey: randomUUID(),
  }),
);
await step('clube: pausar assinatura', async () => {
  const a = await g.account();
  const s = a.subscriptions[0];
  assert.ok(s, 'sem assinatura na conta');
  return g.changeSubscription({ id: s.id, action: 'pause' });
});
await step('suporte: abrir atendimento', () =>
  g.createTicket({
    subject: 'Dúvida sobre entrega',
    category: 'Pedido',
    message: 'Quando chega meu pedido de teste?',
  }),
);
await step('suporte: responder atendimento', async () => {
  const a = await g.account();
  assert.ok(a.tickets[0], 'sem atendimento');
  return g.replyTicket(a.tickets[0].id, 'Obrigado, aguardo retorno.');
});
await step('mural: publicar pedido de oração', () =>
  g.postPrayer({
    name: 'QA',
    title: 'Pela minha família',
    message: 'Peço oração pela saúde da minha família.',
    category: 'Família',
    anonymous: false,
    consent: true,
  }),
);
const prayers = await step('mural: listar', () => g.community());
const mine = prayers?.find((p) => p.owned);
await step('mural: autor vê o estado de revisão do próprio pedido', async () => {
  assert.ok(mine, 'pedido próprio não listado');
  assert.ok(mine.moderation === 'Em análise' || mine.moderation === 'Publicado');
});
const visible = prayers?.find((p) => !p.hidden && !p.owned);
if (visible) {
  await step('mural: reagir', () => g.reactPrayer(visible.id));
  await step('mural: denunciar', () => g.reportPrayer(visible.id, 'Teste de denúncia QA'));
}
if (mine)
  await step('mural: remover o próprio pedido some da lista', async () => {
    await g.deletePrayer(mine.id);
    assert.ok(!(await g.community()).some((p) => p.id === mine.id));
  });
await step('oração diária: inscrição', () =>
  g.newsletter({ name: 'QA', email: `oracao.qa+${Date.now()}@exemplo.com`, consent: true }),
);
await step('conta: sair', () => g.logout());
await step('conta: sessão encerrada', async () => assert.equal(await g.session(), null));

const staff = gatewayWithJar();
await step('admin: login da equipe', () =>
  staff.login({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    kind: 'staff',
  }),
);
const ops = await step('admin: snapshot operacional', () => staff.admin());
const adminOrder = ops?.orders?.find((o) => o.id === order?.orderId) || ops?.orders?.[0];
if (adminOrder)
  await step('admin: atualizar pedido', () =>
    staff.adminCommand({
      type: 'order.update',
      id: adminOrder.id,
      status: adminOrder.status,
      priority: 'Alta',
      due: adminOrder.due || new Date().toISOString().slice(0, 10),
      notes: 'Nota interna QA',
    }),
  );
await step('admin: ajustar estoque', () =>
  staff.adminCommand({
    type: 'stock.adjust',
    productId: product.id,
    delta: 5,
    reason: 'Entrada QA de estoque',
  }),
);
await step('admin: cliente não acessa admin', async () => {
  await assert.rejects(() => g.admin());
});
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passos OK`);
process.exitCode = failed.length ? 1 : 0;

import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { operationsSchema, accountSchema } from '../src/lib/api/response-schemas.ts';
import sharp from 'sharp';
import { Queue } from 'bullmq';
import { createContext, closeContext } from '@maos-em-oracao/backend-core/context';
import { unseal } from '@maos-em-oracao/backend-core/security';
import { WorkerEngine, queueConnection } from '@maos-em-oracao/backend-core/worker';
const root = fileURLToPath(new URL('../', import.meta.url)),
  runId = randomBytes(6).toString('hex'),
  databaseName = 'meo_test_' + runId;
const sourceUrl = new URL(process.env.DATABASE_URL || '');
if (!sourceUrl.protocol.startsWith('postgres'))
  throw new Error(
    'Informe DATABASE_URL para um PostgreSQL de testes com permissão de criar um banco isolado.',
  );
const databaseUrl = new URL(sourceUrl);
databaseUrl.pathname = '/' + databaseName;
const signingKey = randomBytes(32);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl.toString(),
  REDIS_URL: process.env.REDIS_URL,
  QUEUE_PREFIX: 'meotest' + runId,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  BFF_SHARED_SECRET: randomBytes(48).toString('hex'),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  INTEGRATIONS_MODE: 'mock',
  PAYMENTS_ENABLED: 'false',
  EMAIL_ENABLED: 'false',
  SPLIT_PAYMENT_ENABLED: 'true',
  PUBLIC_WEB_URL: 'http://127.0.0.1:4502',
  PUBLIC_API_URL: 'http://127.0.0.1:4500',
  PORT: '4500',
  WORKER_PORT: '4501',
  LOCAL_DATA_DIR: 'var/backend-tests/' + runId,
  BOOTSTRAP_ADMIN_EMAIL: 'owner-' + runId + '@example.test',
  BOOTSTRAP_ADMIN_PASSWORD: 'Integration!' + randomBytes(20).toString('hex'),
  SEED_DEMO_CATALOG: 'true',
  MP_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
  RESEND_WEBHOOK_SECRET: 'whsec_' + signingKey.toString('base64'),
  MEO_BOOTSTRAP: 'true',
  MODEL_CONVERTER_PATH: fileURLToPath(
    new URL('../apps/worker/dist/model-converter.mjs', import.meta.url),
  ),
};
const base = env.PUBLIC_API_URL + '/api/v1',
  children = [],
  files = [];
let ctx,
  engine,
  created = false,
  passed = 0;
const adminDb = new pg.Client({
  connectionString: sourceUrl.toString(),
  connectionTimeoutMillis: 5000,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(name, work) {
  await work();
  passed++;
  console.log('PASS ' + name);
}
async function until(work, message, ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const result = await work();
    if (result) return result;
    await sleep(150);
  }
  throw new Error('TIMEOUT: ' + message);
}
class Client {
  cookies = new Map();
  async call(path, method = 'GET', body, options = {}) {
    const headers = {
      'x-bff-secret': env.BFF_SHARED_SECRET,
      origin: env.PUBLIC_WEB_URL,
      ...options.headers,
    };
    if (this.cookies.size)
      headers.cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; ');
    let content;
    if (options.bytes) {
      content = options.bytes;
      headers['content-type'] = 'application/octet-stream';
    } else if (body !== undefined) {
      content = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(base + '/' + path, {
      method,
      headers,
      body: content,
      signal: AbortSignal.timeout(20000),
    });
    for (const item of response.headers.getSetCookie()) {
      const pair = item.split(';')[0],
        i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    return { status: response.status, body: payload, headers: response.headers };
  }
  async command(command, key = randomUUID()) {
    const r = await this.call('admin/commands', 'POST', command, {
      headers: { 'idempotency-key': key },
    });
    assert.equal(r.status, 204, r.body?.error?.code);
    return r;
  }
  async data(path) {
    const r = await this.call(path);
    assert.equal(r.status, 200, r.body?.error?.code);
    return r.body.data;
  }
}
async function launch(entry) {
  const file = await open(
    new URL('../' + env.LOCAL_DATA_DIR + '/' + entry + '.log', import.meta.url),
    'w',
  );
  files.push(file);
  const child = spawn(process.execPath, ['apps/' + entry + '/dist/main.mjs'], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', file.fd, file.fd],
  });
  children.push(child);
  return child;
}
function cli(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).slice(-2000));
}
async function register(client, label) {
  const email = label + '-' + runId + '@example.test',
    password = 'IntegrationTeste!2026';
  const r = await client.call('auth/login', 'POST', {
    name: 'Cliente de teste ' + label,
    email,
    password,
    kind: 'customer',
    register: true,
  });
  assert.equal(r.status, 200, r.body?.error?.code);
  return { email, password, user: r.body.data };
}
function address(email) {
  return {
    name: 'Cliente de Homologação',
    email,
    phone: '11999990000',
    cep: '01001-000',
    street: 'Rua de Teste',
    number: '100',
    extra: '',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
  };
}
async function quote(client, p, quantity = 1) {
  const r = await client.call('shipping/quotes', 'POST', {
    cep: '01001-000',
    items: [{ productId: p.id, quantity, sizeIndex: 0 }],
  });
  assert.equal(r.status, 200, r.body?.error?.code);
  return r.body.data[0];
}
function checkout(p, q, email, payment = 'pix') {
  return {
    items: [{ productId: p.id, quantity: 1, color: p.colors[0], sizeIndex: 0, dedication: '' }],
    address: address(email),
    shipping: q.id,
    shippingQuoteId: q.quoteId,
    shippingServiceId: q.serviceId,
    coupon: '',
    payment,
    pixCents: payment === 'split' ? 2000 : 0,
    installments: 1,
    consent: true,
    idempotencyKey: randomUUID(),
    ...(payment !== 'pix'
      ? {
          paymentToken: {
            token: 'mock-approved',
            paymentMethodId: 'visa',
            installments: 1,
            payer: { email },
          },
        }
      : {}),
  };
}
async function buy(client, body) {
  return client.call('orders', 'POST', body, {
    headers: { 'idempotency-key': body.idempotencyKey },
  });
}
async function mail(aggregate, kind) {
  return until(async () => {
    const rows = await ctx.db.outboxEvent.findMany({
      where: { aggregateId: aggregate, kind: 'email' },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      const envelope = unseal(row.payloadEncrypted, ctx.config);
      if (envelope.kind === kind) return { row, envelope };
    }
    return null;
  }, 'e-mail ' + kind);
}
try {
  await adminDb.connect();
  assert.match(databaseName, /^meo_test_[a-f0-9]{12}$/);
  await adminDb.query('CREATE DATABASE "' + databaseName + '"');
  created = true;
  await mkdir(new URL('../' + env.LOCAL_DATA_DIR + '/', import.meta.url), { recursive: true });
  cli([
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--config',
    'packages/database/prisma.config.ts',
  ]);
  cli(['--import', 'tsx', 'scripts/backend-seed.mjs']);
  ctx = createContext((await import('@maos-em-oracao/backend-core/config')).loadConfig(env));
  await ctx.redis.connect();
  engine = new WorkerEngine(ctx);
  await launch('api');
  await until(
    async () => {
      try {
        return (await fetch(env.PUBLIC_API_URL + '/api/v1/health/ready')).ok;
      } catch {
        return false;
      }
    },
    'API pronta',
    60000,
  );
  await launch('worker');
  await until(
    async () => {
      try {
        return (await fetch('http://127.0.0.1:4501/health/ready')).ok;
      } catch {
        return false;
      }
    },
    'worker pronto',
    60000,
  );
  const owner = new Client(),
    customer = new Client(),
    other = new Client(),
    guest = new Client();
  let first, second, product, orderId, ops, subId;
  await check('API exige gateway e origem autorizados', async () => {
    assert.equal((await fetch(base + '/admin/operations')).status, 403);
    assert.equal(
      (
        await owner.call(
          'auth/logout',
          'POST',
          {},
          { headers: { origin: 'https://invalid.example' } },
        )
      ).status,
      403,
    );
  });
  await check('login real da equipe com senha Argon2', async () => {
    const r = await owner.call('auth/login', 'POST', {
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      password: env.BOOTSTRAP_ADMIN_PASSWORD,
      kind: 'staff',
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.demo, false);
    assert.equal(r.body.data.role, 'admin');
  });
  await check('catálogo e operações persistidos sem hashes de senha', async () => {
    product = (await customer.data('catalog/products'))[0];
    ops = await owner.data('admin/operations');
    operationsSchema.parse(ops);
    assert.equal(ops.products.length, 6);
    assert(!JSON.stringify(ops).includes('passwordHash'));
    assert.equal(ops.orders.length, 0);
  });
  await check('cadastro e isolamento da conta', async () => {
    first = await register(customer, 'primeiro');
    second = await register(other, 'segundo');
    const a = accountSchema.parse(await customer.data('account'));
    assert.equal(a.customer.email, first.email);
    assert.equal(a.orders.length, 0);
    assert.equal((await customer.call('admin/operations')).status, 403);
  });
  let pix;
  await check('checkout Pix recalcula preço e preserva idempotência', async () => {
    const q = await quote(customer, product);
    pix = checkout(product, q, first.email);
    const r = await buy(customer, pix);
    assert.equal(r.status, 200, r.body?.error?.code);
    orderId = r.body.data.orderId;
    assert.equal(r.body.data.paymentAction.type, 'pix');
    const duplicate = await buy(customer, pix);
    assert.equal(duplicate.body.data.orderId, orderId);
    assert.equal(await ctx.db.order.count(), 1);
    const altered = await buy(customer, { ...pix, items: [{ ...pix.items[0], quantity: 2 }] });
    assert.equal(altered.status, 409);
    assert.equal((await other.call('orders/' + orderId + '/payment')).status, 404);
  });
  await check('checkout concorrente não duplica pedido', async () => {
    const q = await quote(customer, product),
      input = checkout(product, q, first.email);
    const result = await Promise.all([buy(customer, input), buy(customer, input)]);
    assert(
      result.every((r) => r.status === 200),
      result.map((r) => r.body?.error?.code).join(','),
    );
    assert.equal(result[0].body.data.orderId, result[1].body.data.orderId);
  });
  await check('visitante recebe acesso restrito ao próprio pedido', async () => {
    const q = await quote(guest, product),
      r = await buy(guest, checkout(product, q, 'visitante-' + runId + '@example.test'));
    assert.equal(r.status, 200);
    const account = accountSchema.parse(await guest.data('account'));
    assert.equal(account.orders.length, 1);
    assert.equal((await guest.call('orders/' + orderId + '/payment')).status, 404);
  });
  await check('pagamento libera produção uma única vez', async () => {
    ops = await owner.data('admin/operations');
    const charge = ops.charges.find((c) => c.orderId === orderId);
    await owner.command({ type: 'charge.pay', id: charge.id });
    await owner.command({ type: 'charge.pay', id: charge.id });
    assert.equal(await ctx.db.productionJob.count({ where: { orderId } }), 1);
    assert.equal(
      await ctx.db.ledgerEntry.count({ where: { intentId: charge.id, kind: 'payment' } }),
      1,
    );
  });
  await check('pagamento combinado só produz após as duas partes', async () => {
    const q = await quote(customer, product),
      input = {
        ...checkout(product, q, first.email, 'split'),
        paymentToken: {
          token: 'mock-approved',
          paymentMethodId: 'visa',
          installments: 1,
          payer: { email: first.email },
        },
      };
    const r = await buy(customer, input);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.data.orderId,
      intent = await ctx.db.paymentIntent.findUnique({
        where: { orderId: id },
        include: { parts: true },
      });
    assert.equal(intent.parts.find((p) => p.method === 'card').status, 'approved');
    assert.equal(intent.parts.find((p) => p.method === 'pix').status, 'pending');
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 0);
    await owner.command({ type: 'charge.pay', id: intent.id });
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 1);
  });
  await check('expiração de Pix combinado compensa apenas o cartão capturado', async () => {
    const q = await quote(customer, product),
      r = await buy(customer, {
        ...checkout(product, q, first.email, 'split'),
        paymentToken: {
          token: 'mock-approved',
          paymentMethodId: 'visa',
          installments: 1,
          payer: { email: first.email },
        },
      });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.data.orderId,
      intent = await ctx.db.paymentIntent.findUnique({ where: { orderId: id } });
    const service = new (await import('@maos-em-oracao/backend-core/payments')).PaymentsService(
      ctx,
    );
    await service.cancelPending(intent.id);
    await engine.dispatch();
    await until(
      async () =>
        (await ctx.db.paymentIntent.findUnique({ where: { id: intent.id } }))?.status ===
        'Estornado',
      'compensação do cartão',
    );
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 0);
    const refunds = await ctx.db.refund.findMany({ where: { part: { intentId: intent.id } } });
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].amountCents, intent.amountCents - 2000);
  });
  await check('cartão recusado não cria Pix nem inicia produção', async () => {
    const q = await quote(customer, product),
      r = await buy(customer, {
        ...checkout(product, q, first.email, 'split'),
        paymentToken: {
          token: 'mock-declined',
          paymentMethodId: 'visa',
          installments: 1,
          payer: { email: first.email },
        },
      });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const intent = await ctx.db.paymentIntent.findUnique({
      where: { orderId: r.body.data.orderId },
      include: { parts: true },
    });
    assert.equal(intent.status, 'Recusado');
    assert.equal(intent.parts.find((p) => p.method === 'pix').providerId, null);
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: intent.orderId } }), 0);
  });
  await check('Pix vencido renova cobrança sem duplicar pedido', async () => {
    const q = await quote(customer, product),
      r = await buy(customer, checkout(product, q, first.email)),
      id = r.body.data.orderId,
      p = await ctx.db.paymentIntent.findUnique({ where: { orderId: id } }),
      service = new (await import('@maos-em-oracao/backend-core/payments')).PaymentsService(ctx);
    await service.cancelPending(p.id);
    const key = randomUUID();
    for (let n = 0; n < 2; n++) {
      const result = await customer.call(
        'orders/' + id + '/payment',
        'POST',
        {},
        { headers: { 'idempotency-key': key } },
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.paymentAction.type, 'pix');
    }
    assert.equal(await ctx.db.paymentPart.count({ where: { intentId: p.id } }), 2);
    assert.equal(
      (await ctx.db.paymentIntent.findUnique({ where: { id: p.id } })).status,
      'Pendente',
    );
    assert.equal(
      (
        await other.call(
          'orders/' + id + '/payment',
          'POST',
          {},
          { headers: { 'idempotency-key': randomUUID() } },
        )
      ).status,
      404,
    );
  });
  await check('desafio 3DS mantém Pix e produção bloqueados até confirmar o cartão', async () => {
    const q = await quote(customer, product),
      input = checkout(product, q, first.email, 'split');
    input.paymentToken.token = 'mock-challenge';
    const r = await buy(customer, input);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.paymentAction.type, 'challenge');
    const id = r.body.data.orderId,
      intent = await ctx.db.paymentIntent.findUnique({
        where: { orderId: id },
        include: { parts: true },
      }),
      card = intent.parts.find((p) => p.method === 'card');
    assert.equal(intent.parts.find((p) => p.method === 'pix').providerId, null);
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 0);
    const service = new (await import('@maos-em-oracao/backend-core/payments')).PaymentsService(
      ctx,
    );
    await service.apply({
      id: card.providerId,
      reference: card.id,
      status: 'approved',
      amountCents: card.amountCents,
      currency: 'BRL',
      refundedCents: 0,
      updatedAt: new Date().toISOString(),
      action: { type: 'none' },
    });
    await engine.dispatch();
    await until(
      async () =>
        (await ctx.db.paymentPart.findFirst({ where: { intentId: intent.id, method: 'pix' } }))
          ?.status === 'pending',
      'Pix após confirmação 3DS',
    );
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 0);
    await owner.command({ type: 'charge.pay', id: intent.id });
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: id } }), 1);
  });
  await check('estoque disputa última unidade sem saldo negativo', async () => {
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'workspace.save',
      settings: { ...ops.workspace, inventoryPolicy: 'stock' },
    });
    const p = ops.products.find((p) => p.id === product.id);
    await owner.command({ type: 'product.save', product: { ...p, stock: 1 } });
    const [q1, q2] = await Promise.all([quote(customer, p), quote(other, p)]),
      inputs = [checkout(p, q1, first.email), checkout(p, q2, second.email)],
      results = await Promise.all([buy(customer, inputs[0]), buy(other, inputs[1])]);
    assert.equal(
      results.filter((r) => r.status === 200).length,
      1,
      JSON.stringify(results.map((r) => ({ status: r.status, code: r.body?.error?.code }))),
    );
    assert.equal(results.filter((r) => r.status === 409).length, 1);
    const row = await ctx.db.product.findUnique({ where: { id: p.id } });
    assert.equal(row.reserved, 1);
    assert.equal(row.stock, 1);
    await owner.command({
      type: 'workspace.save',
      settings: { ...ops.workspace, inventoryPolicy: 'on-demand' },
    });
  });
  await check('comando repetido ajusta estoque uma única vez', async () => {
    const key = randomUUID(),
      before = await ctx.db.product.findUnique({ where: { id: product.id } }),
      cmd = {
        type: 'stock.adjust',
        productId: product.id,
        delta: 2,
        reason: 'Ajuste de homologação',
      };
    await owner.command(cmd, key);
    await owner.command(cmd, key);
    assert.equal(
      (await ctx.db.product.findUnique({ where: { id: product.id } })).stock,
      before.stock + 2,
    );
  });
  await check('produção percorre etapas e reserva impressora', async () => {
    ops = await owner.data('admin/operations');
    const job = ops.jobs.find((j) => j.orderId === orderId);
    await owner.command({
      type: 'production.update',
      id: job.id,
      printer: ops.printers[0].name,
      hours: 2,
      assignee: 'Equipe de teste',
      due: job.due,
      priority: 'Normal',
      notes: '',
      material: 'PLA',
      grams: 20,
    });
    const key = randomUUID();
    await owner.command({ type: 'production.advance', id: job.id }, key);
    await owner.command({ type: 'production.advance', id: job.id }, key);
    assert.equal(
      (await ctx.db.productionJob.findUnique({ where: { id: job.id } })).stage,
      'Impressão',
    );
    for (let i = 0; i < 3; i++) await owner.command({ type: 'production.advance', id: job.id });
    assert.equal(
      (await ctx.db.order.findUnique({ where: { id: orderId } })).status,
      'Pronto para envio',
    );
  });
  await check('etiqueta, postagem e entrega são etapas distintas', async () => {
    await owner.command({ type: 'shipping.label', id: orderId, action: 'prepare' });
    await owner.command({ type: 'shipping.label', id: orderId, action: 'generate' });
    await engine.dispatch();
    await until(
      async () => (await ctx.db.shipment.findUnique({ where: { orderId } }))?.state === 'ready',
      'etiqueta pronta',
    );
    assert.equal(
      (await ctx.db.order.findUnique({ where: { id: orderId } })).status,
      'Pronto para envio',
    );
    await owner.command({
      type: 'shipping.dispatch',
      id: orderId,
      tracking: 'TESTE-SEM-ENVIO-1042',
      carrier: 'Homologação',
    });
    assert.equal((await ctx.db.order.findUnique({ where: { id: orderId } })).status, 'Enviado');
    await owner.command({ type: 'shipping.deliver', id: orderId });
    assert.equal((await ctx.db.order.findUnique({ where: { id: orderId } })).status, 'Entregue');
  });
  await check('suporte mantém nota interna fora da conta e do e-mail', async () => {
    assert.equal(
      (
        await customer.call('support/tickets', 'POST', {
          subject: 'Pedido de homologação',
          category: 'Pedidos',
          message: 'Mensagem pública de suporte para teste.',
        })
      ).status,
      204,
    );
    ops = await owner.data('admin/operations');
    const t = ops.tickets.find(
      (t) => t.customerId === ops.orders.find((o) => o.id === orderId).customerId,
    );
    await owner.command({
      type: 'ticket.reply',
      id: t.id,
      message: 'NOTA-INTERNA-PRIVADA',
      internal: true,
      status: 'Em atendimento',
      assignee: 'Equipe',
    });
    assert(!JSON.stringify(await customer.data('account')).includes('NOTA-INTERNA-PRIVADA'));
    await owner.command({
      type: 'ticket.reply',
      id: t.id,
      message: 'Resposta pública de teste.',
      status: 'Resolvido',
      assignee: 'Equipe',
    });
    const e = await mail(t.id, 'support-reply');
    assert(!e.envelope.html.includes('NOTA-INTERNA-PRIVADA'));
  });
  await check('convite de uso único cria perfil com permissões reais', async () => {
    await owner.command({
      type: 'invite.create',
      name: 'Produção teste',
      email: 'production-' + runId + '@example.test',
      role: 'production',
      permissions: ['production'],
    });
    ops = await owner.data('admin/operations');
    const invite = ops.invitations[0],
      staff = new Client();
    assert(invite.token);
    assert.equal(
      (
        await staff.call('team/invitations/' + invite.token + '/accept', 'POST', {
          name: 'Produção teste',
          password: 'EquipeHomologacao!2026',
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await staff.call('team/invitations/' + invite.token + '/accept', 'POST', {
          name: 'Produção teste',
          password: 'EquipeHomologacao!2026',
        })
      ).status,
      410,
    );
    assert.equal(
      (
        await staff.call('auth/login', 'POST', {
          email: invite.email,
          password: 'EquipeHomologacao!2026',
          kind: 'staff',
        })
      ).status,
      200,
    );
    const data = await staff.data('admin/operations');
    assert.equal(data.charges.length, 0);
    assert.equal(data.clients.length, 0);
    assert.equal((await staff.call('admin/resources/finance')).status, 403);
    assert.equal(
      (
        await staff.call(
          'admin/commands',
          'POST',
          { type: 'charge.pay', id: randomUUID() },
          { headers: { 'idempotency-key': randomUUID() } },
        )
      ).status,
      403,
    );
  });
  await check('mural exige moderação e restringe exclusão ao autor', async () => {
    await customer.call('community/prayers', 'POST', {
      name: 'Cliente',
      title: 'Oração pela família',
      message: 'Pedido de oração fictício para homologação.',
      category: 'Família',
      anonymous: false,
      consent: true,
    });
    ops = await owner.data('admin/operations');
    const p = ops.prayers[0];
    assert(!(await other.data('community/prayers')).some((v) => v.id === p.id));
    assert.equal((await other.call('community/prayers/' + p.id, 'DELETE')).status, 404);
    await owner.command({
      type: 'prayer.review',
      id: p.id,
      status: 'Publicado',
      note: 'Moderado para teste.',
    });
    assert((await other.data('community/prayers')).some((v) => v.id === p.id));
    assert.equal(
      (await other.call('community/prayers/' + p.id + '/reaction', 'POST', {})).status,
      204,
    );
  });
  await check('assinatura Pix é idempotente e só ativa após pagamento', async () => {
    const input = {
        profile: 'Cristã',
        finish: 'Marfim',
        address: address(first.email),
        payment: 'pix',
        consent: true,
        idempotencyKey: randomUUID(),
      },
      r = await customer.call('subscriptions', 'POST', input, {
        headers: { 'idempotency-key': input.idempotencyKey },
      });
    assert.equal(r.status, 200, r.body?.error?.code);
    subId = r.body.data.subscriptionId;
    const duplicate = await customer.call('subscriptions', 'POST', input, {
      headers: { 'idempotency-key': input.idempotencyKey },
    });
    assert.equal(duplicate.body.data.subscriptionId, subId);
    assert.equal(
      (await ctx.db.subscription.findUnique({ where: { id: subId } })).status,
      'Pagamento pendente',
    );
    const payment = await ctx.db.paymentIntent.findUnique({
      where: { orderId: r.body.data.orderId },
    });
    await owner.command({ type: 'charge.pay', id: payment.id });
    assert.equal((await ctx.db.subscription.findUnique({ where: { id: subId } })).status, 'Ativa');
    assert.equal(await ctx.db.subscriptionCycle.count({ where: { subscriptionId: subId } }), 1);
  });
  await check('pausa e retomada do clube respeitam propriedade', async () => {
    assert.equal(
      (await other.call('subscriptions/' + subId, 'PATCH', { action: 'pause' })).status,
      404,
    );
    assert.equal(
      (await customer.call('subscriptions/' + subId, 'PATCH', { action: 'pause' })).status,
      204,
    );
    assert.equal(
      (await ctx.db.subscription.findUnique({ where: { id: subId } })).status,
      'Pausada',
    );
    assert.equal(
      (await customer.call('subscriptions/' + subId, 'PATCH', { action: 'resume' })).status,
      204,
    );
  });
  await check(
    'mensalidade nativa não duplica cesta nem estorna pagamento histórico após cancelamento',
    async () => {
      const input = {
          profile: 'Cristã',
          finish: 'Marfim',
          address: address(first.email),
          payment: 'card',
          paymentToken: {
            token: 'mock-approved',
            paymentMethodId: 'visa',
            installments: 1,
            payer: { email: first.email },
          },
          consent: true,
          idempotencyKey: randomUUID(),
        },
        r = await customer.call('subscriptions', 'POST', input, {
          headers: { 'idempotency-key': input.idempotencyKey },
        });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const sub = await ctx.db.subscription.findUnique({
          where: { id: r.body.data.subscriptionId },
        }),
        service = new (
          await import('@maos-em-oracao/backend-core/subscriptions')
        ).SubscriptionsService(ctx),
        original = { ...ctx.payments };
      let paymentId = 'native-first-' + runId;
      const date = new Date().toISOString();
      ctx.payments.authorizedPayment = async () => ({
        id: 'invoice',
        preapproval_id: sub.providerId,
        date_created: date,
        payment: { id: paymentId },
      });
      ctx.payments.get = async (id) => ({
        id,
        status: 'approved',
        currency: 'BRL',
        amountCents: sub.priceCents,
        reference: sub.id,
        updatedAt: new Date().toISOString(),
        refundedCents: 0,
        action: { type: 'none' },
      });
      try {
        await service.recurringPayment('invoice');
        await service.recurringPayment('invoice');
        assert.equal(await ctx.db.order.count({ where: { subscriptionId: sub.id } }), 1);
        assert.equal(
          await ctx.db.productionJob.count({ where: { order: { subscriptionId: sub.id } } }),
          1,
        );
        const updated = await ctx.db.subscription.findUnique({ where: { id: sub.id } });
        assert.equal(updated.nextRenewal.getUTCDate(), sub.nextRenewal.getUTCDate());
        paymentId = 'native-duplicate-' + runId;
        await service.recurringPayment('duplicate');
        await engine.dispatch();
        await until(
          async () =>
            (await ctx.db.paymentException.findUnique({ where: { providerId: paymentId } }))
              ?.state === 'refunded',
          'estorno da mensalidade duplicada',
        );
        assert.equal(await ctx.db.order.count({ where: { subscriptionId: sub.id } }), 1);
        await customer.call('subscriptions/' + sub.id, 'PATCH', { action: 'cancel' });
        paymentId = 'native-first-' + runId;
        await service.recurringPayment('invoice');
        assert.equal(await ctx.db.paymentException.count({ where: { providerId: paymentId } }), 0);
        assert.equal(
          (await ctx.db.subscription.findUnique({ where: { id: sub.id } })).status,
          'Cancelada',
        );
      } finally {
        Object.assign(ctx.payments, original);
      }
    },
  );
  await check(
    'link de pedido funciona em outro navegador e protege os demais dados após confirmar e-mail',
    async () => {
      const visitor = new Client(),
        email = 'acesso-' + runId + '@example.test',
        q = await quote(visitor, product),
        r = await buy(visitor, checkout(product, q, email)),
        id = r.body.data.orderId;
      const m = await mail(id, 'order-received'),
        url = m.envelope.text.match(/https?:[^\s]+\/pedido\/acesso\?token=[^\s]+/)[0],
        t = new URL(url).searchParams.get('token'),
        fresh = new Client();
      assert.equal((await fresh.call('auth/guest-order', 'POST', { token: t })).status, 200);
      assert.equal((await fresh.data('account')).orders[0].id, id);
      assert.equal((await fresh.call('auth/guest-order', 'POST', { token: t })).status, 422);
      const account = new Client(),
        register = await account.call('auth/login', 'POST', {
          name: 'Conta de teste',
          email,
          password: 'ContaHomologacao!2026',
          kind: 'customer',
          register: true,
        });
      const verify = await mail(register.body.data.id, 'verify-email'),
        token = new URL(
          verify.envelope.text.match(/https?:[^\s]+\/conta\/confirmar[^\s]+/)[0],
        ).searchParams.get('token');
      assert.equal((await account.call('auth/verify', 'POST', { token })).status, 204);
      assert((await account.data('account')).orders.some((o) => o.id === id));
      const guestAccount = await fresh.data('account');
      assert.equal(guestAccount.orders.length, 1);
      assert.equal(guestAccount.tickets.length, 0);
      assert.equal(guestAccount.subscriptions.length, 0);
      assert.equal(
        (await fresh.call('account/profile', 'PATCH', { name: 'Ataque', email })).status,
        403,
      );
    },
  );
  await check('estorno usa fila, conciliação e ledger sem duplicação', async () => {
    ops = await owner.data('admin/operations');
    const charge = ops.charges.find((c) => c.orderId === orderId);
    await owner.command({
      type: 'charge.refund',
      id: charge.id,
      reason: 'Estorno de homologação.',
    });
    await engine.dispatch();
    await until(
      async () =>
        (await ctx.db.paymentIntent.findUnique({ where: { id: charge.id } }))?.status ===
        'Estornado',
      'estorno conciliado',
    );
    assert.equal(await ctx.db.refund.count({ where: { part: { intentId: charge.id } } }), 1);
    assert.equal((await ctx.db.order.findUnique({ where: { id: orderId } })).status, 'Entregue');
  });
  await check('recuperação de senha usa token único e revoga sessões', async () => {
    assert.equal(
      (await customer.call('auth/recover', 'POST', { email: first.email, kind: 'customer' }))
        .status,
      200,
    );
    const m = await mail(first.user.id, 'password-reset'),
      url = m.envelope.text.match(/Criar uma nova senha: (\S+)/)[1],
      token = new URL(url).searchParams.get('token');
    assert.equal(
      (await customer.call('auth/reset', 'POST', { token, password: 'SenhaNovaHomologacao!2026' }))
        .status,
      204,
    );
    assert.equal(
      (await customer.call('auth/reset', 'POST', { token, password: 'OutraSenhaHomologacao!2026' }))
        .status,
      422,
    );
    assert.equal((await customer.call('auth/session')).body.data, null);
    assert.equal(
      (
        await customer.call('auth/login', 'POST', {
          email: first.email,
          password: 'SenhaNovaHomologacao!2026',
          kind: 'customer',
        })
      ).status,
      200,
    );
  });
  await check('upload STL vira GLB real e atualiza produto', async () => {
    const binary = await readFile(
        new URL('../src/lib/media/__fixtures__/modelo-teste.stl', import.meta.url),
      ),
      u = await owner.call('admin/media/uploads', 'POST', {
        name: 'modelo-teste.stl',
        mime: 'application/octet-stream',
        size: binary.length,
        kind: 'model',
      });
    assert.equal(u.status, 200, u.body?.error?.code);
    const id = u.body.data.id;
    assert.equal(
      (
        await owner.call('admin/media/uploads/' + id + '/content', 'PUT', undefined, {
          bytes: binary,
        })
      ).status,
      204,
    );
    assert.equal(
      (await owner.call('admin/media/uploads/' + id + '/complete', 'POST', {})).status,
      200,
    );
    await engine.dispatch();
    await until(
      async () => (await ctx.db.mediaAsset.findUnique({ where: { id } }))?.state === 'ready',
      'STL convertido',
    );
    const asset = await ctx.db.mediaAsset.findUnique({ where: { id } });
    assert(asset.data.stats.triangles > 0);
    const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#3e4934' },
      })
        .png()
        .toBuffer(),
      up = await owner.call('admin/media/uploads', 'POST', {
        name: 'teste.png',
        mime: 'image/png',
        size: image.length,
        kind: 'image',
      }),
      imageId = up.body.data.id;
    await owner.call('admin/media/uploads/' + imageId + '/content', 'PUT', undefined, {
      bytes: image,
    });
    const ready = await owner.call('admin/media/uploads/' + imageId + '/complete', 'POST', {});
    assert.equal(ready.body.data.status, 'ready');
    ops = await owner.data('admin/operations');
    const p = {
      ...ops.products[0],
      id: randomUUID(),
      sku: 'MEO-TEST-' + runId,
      name: 'Produto com modelo real',
      active: true,
      image: ready.body.data.url,
      media: [
        {
          id: imageId,
          kind: 'image',
          source: 'upload',
          assetId: imageId,
          url: ready.body.data.url,
          alt: 'Imagem de homologação',
        },
      ],
      model: { assetId: id, filename: 'modelo-teste.stl', format: 'stl', status: 'ready' },
    };
    await owner.command({ type: 'product.save', product: p });
    const publicProduct = await guest.data('catalog/products/' + p.id);
    assert.equal(publicProduct.model.status, 'ready');
    assert(publicProduct.model.previewUrl.endsWith('preview.glb'));
    const f = await fetch(base + '/media/public/' + id + '/preview.glb');
    assert.equal(f.status, 200);
    const glb = Buffer.from(await f.arrayBuffer());
    assert.equal(glb.readUInt32LE(0), 0x46546c67);
    assert.equal((await owner.call('admin/media/' + id + '/original')).status, 200);
    assert.equal((await guest.call('admin/media/' + id + '/original')).status, 403);
  });
  await check('upload 3MF também gera geometria e arquivo inválido falha', async () => {
    for (const [name, valid] of [
      ['modelo-teste.3mf', true],
      ['invalido.stl', false],
    ]) {
      const bytes = valid
          ? await readFile(
              new URL('../src/lib/media/__fixtures__/modelo-teste.3mf', import.meta.url),
            )
          : Buffer.from('solid invalid\nendsolid invalid\n'),
        u = await owner.call('admin/media/uploads', 'POST', {
          name,
          mime: 'application/octet-stream',
          size: bytes.length,
          kind: 'model',
        }),
        id = u.body.data.id;
      await owner.call('admin/media/uploads/' + id + '/content', 'PUT', undefined, { bytes });
      await owner.call('admin/media/uploads/' + id + '/complete', 'POST', {});
      await engine.dispatch();
      await until(async () => {
        const a = await ctx.db.mediaAsset.findUnique({ where: { id } });
        return a.state === (valid ? 'ready' : 'failed');
      }, name);
    }
  });
  await check('relatório paginado e CSV gerado no worker', async () => {
    const page = await owner.data('admin/resources/orders?limit=1');
    assert.equal(page.items.length, 1);
    assert(page.nextCursor);
    const r = await owner.call('admin/exports', 'POST', { kind: 'orders', filters: {} });
    assert.equal(r.status, 200);
    await engine.dispatch();
    const id = r.body.data.id;
    await until(
      async () => (await ctx.db.reportExport.findUnique({ where: { id } }))?.state === 'ready',
      'CSV pronto',
    );
    const csv = await owner.call('admin/exports/' + id + '/download');
    assert.equal(csv.status, 200);
    assert(csv.body.includes('MEO-'));
    assert(csv.headers.get('content-disposition').includes('.csv'));
  });
  await check('oração diária usa double opt-in e descadastro one-click', async () => {
    const email = 'oracao-' + runId + '@example.test';
    assert.equal(
      (await guest.call('newsletter', 'POST', { name: 'Pessoa de teste', email, consent: true }))
        .status,
      200,
    );
    const sub = await ctx.db.devotionalSubscriber.findUnique({ where: { email } }),
      opt = await mail(sub.id, 'devotional-opt-in'),
      url = opt.envelope.text.match(/Quero receber minha oração: (\S+)/)[1];
    assert.equal(sub.verifiedAt, null);
    assert.equal(
      (
        await guest.call('newsletter/confirm', 'POST', {
          token: new URL(url).searchParams.get('token'),
        })
      ).status,
      204,
    );
    const links = (await import('@maos-em-oracao/backend-core/notifications')).Notifications;
    const token = new URL(
      new links(ctx).unsubscribeLinks(sub.id, sub.tokenVersion).oneClickUnsubscribeUrl,
    ).searchParams.get('token');
    const r = await fetch(base + '/newsletter/one-click?token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    assert.equal(r.status, 204);
    assert(
      (await ctx.db.devotionalSubscriber.findUnique({ where: { id: sub.id } })).unsubscribedAt,
    );
  });
  await check('gráficos e totais financeiros vêm do ledger completo', async () => {
    const totals = await owner.data('admin/overview');
    assert(Array.isArray(totals.daily));
    assert(Array.isArray(totals.distribution));
    assert.equal(totals.netCents, totals.grossCents - totals.expensesCents - totals.refundsCents);
    assert(totals.ordersInProgress > 0);
    assert.equal((await customer.call('admin/overview')).status, 403);
  });
  await check('estimativa usa preços atuais e cupons do banco sem consumir limite', async () => {
    const p = await ctx.db.product.findFirstOrThrow({ where: { active: true, archived: false } });
    const item = {
      productId: p.id,
      quantity: 2,
      color: p.data.colors[0],
      sizeIndex: 0,
      dedication: '',
    };
    const code = 'REAL' + runId.toUpperCase();
    await ctx.db.coupon.create({
      data: {
        code,
        active: true,
        limit: 10,
        used: 0,
        data: {
          kind: 'fixed',
          amount: 1700,
          minimumCents: 0,
          startsAt: '2020-01-01',
          endsAt: '2099-12-31',
        },
      },
    });
    const r = await owner.call('checkout/estimate', 'POST', { items: [item], coupon: code });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.discountCents, 1700);
    assert.equal(r.body.data.totalCents, p.priceCents * 2 - 1700);
    assert.equal((await ctx.db.coupon.findUniqueOrThrow({ where: { code } })).used, 0);
    assert.equal(
      (await owner.call('checkout/estimate', 'POST', { items: [item], coupon: 'INVALID-' + runId }))
        .status,
      422,
    );
    assert.equal(
      (
        await owner.call('checkout/estimate', 'POST', {
          items: [item],
          coupon: code,
          shippingQuoteId: 'missing',
          cep: '01001-000',
        })
      ).status,
      404,
    );
  });
  await check(
    'todos os recursos e relatórios aplicam autenticação e entregam páginas válidas',
    async () => {
      for (const resource of [
        'orders',
        'subscriptions',
        'customers',
        'products',
        'production',
        'shipping',
        'finance',
        'expenses',
        'support',
        'prayers',
        'campaigns',
        'team',
        'editions',
        'coupons',
        'inventory',
        'audit',
      ]) {
        for (const prefix of ['admin/resources/', 'admin/reports/']) {
          assert.equal((await new Client().call(prefix + resource)).status, 401, resource);
          assert.equal((await owner.call(prefix + resource + '?limit=2')).status, 200, resource);
          assert.equal((await customer.call(prefix + resource)).status, 403, resource);
        }
      }
    },
  );
  await check('alerta de estoque baixo é deduplicado por produto e dia', async () => {
    const mailer = new (await import('@maos-em-oracao/backend-core/notifications')).Notifications(
      ctx,
    );
    const original = await ctx.db.appSetting.findUniqueOrThrow({ where: { key: 'workspace' } });
    await ctx.db.appSetting.update({
      where: { key: 'workspace' },
      data: { data: { ...original.data, inventoryPolicy: 'stock' } },
    });
    await mailer.lowStock();
    const count = await ctx.db.outboxEvent.count({
      where: { kind: 'email', key: { contains: 'operation/low-stock/' } },
    });
    assert(count > 0);
    await mailer.lowStock();
    assert.equal(
      await ctx.db.outboxEvent.count({
        where: { kind: 'email', key: { contains: 'operation/low-stock/' } },
      }),
      count,
    );
    await ctx.db.appSetting.update({ where: { key: 'workspace' }, data: { data: original.data } });
  });
  await check('webhook Mercado Pago rejeita assinatura inválida e deduplica', async () => {
    const value = { id: 'event-test-' + runId, type: 'payment', data: { id: '123456789' } },
      body = JSON.stringify(value),
      requestId = randomUUID(),
      ts = String(Math.floor(Date.now() / 1000)),
      signature = createHmac('sha256', env.MP_WEBHOOK_SECRET)
        .update(`id:${value.data.id};request-id:${requestId};ts:${ts};`)
        .digest('hex');
    assert.equal(
      (
        await fetch(base + '/webhooks/mercado-pago', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      ).status,
      401,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await fetch(base + '/webhooks/mercado-pago', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': requestId,
              'x-signature': `ts=${ts},v1=${signature}`,
            },
            body,
          })
        ).status,
        200,
      );
    assert.equal(
      await ctx.db.webhookInbox.count({ where: { provider: 'mercado-pago', eventId: value.id } }),
      1,
    );
  });
  await check('webhook Resend usa corpo bruto e assinatura SDK', async () => {
    await engine.dispatch();
    const row = await until(
        () => ctx.db.outboxEvent.findFirst({ where: { kind: 'email', state: 'accepted' } }),
        'e-mail mock aceito',
      ),
      value = {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: row.providerId },
      },
      body = JSON.stringify(value),
      id = 'msg_' + runId,
      timestamp = String(Math.floor(Date.now() / 1000)),
      signature =
        'v1,' +
        createHmac('sha256', signingKey).update(`${id}.${timestamp}.${body}`).digest('base64'),
      headers = {
        'Content-Type': 'application/json',
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      };
    assert.equal(
      (await fetch(base + '/webhooks/resend', { method: 'POST', headers, body: body + ' ' }))
        .status,
      401,
    );
    assert.equal(
      (await fetch(base + '/webhooks/resend', { method: 'POST', headers, body })).status,
      200,
    );
    await engine.dispatch();
    await until(
      async () =>
        (await ctx.db.outboxEvent.findUnique({ where: { id: row.id } }))?.state === 'delivered',
      'entrega conciliada',
    );
  });
  operationsSchema.parse(await owner.data('admin/operations'));
  accountSchema.parse(await customer.data('account'));
  console.log(
    `Backend: ${passed} fluxos passaram com PostgreSQL, Redis, API e worker reais; provedores em mock, sem transações externas.`,
  );
} finally {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((r) => child.once('exit', r)), sleep(5000)]);
    }
  }
  if (engine) await engine.close();
  if (ctx) await closeContext(ctx);
  for (const file of files) await file.close();
  if (engine)
    for (const name of ['email', 'operations', 'models', 'exports']) {
      const q = new Queue(env.QUEUE_PREFIX + '-' + name, {
        connection: queueConnection(env.REDIS_URL),
      });
      try {
        await q.obliterate({ force: true });
      } finally {
        await q.close();
      }
    }
  if (created && /^meo_test_[a-f0-9]{12}$/.test(databaseName))
    await adminDb.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await adminDb.end();
}

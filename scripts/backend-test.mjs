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
import { prayerForDay } from '@maos-em-oracao/backend-core/daily-prayers';
import { storiesFeedSchema } from '@maos-em-oracao/contracts';
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
/** A signed-in team member whose only permission is marketing (invited and accepted by the owner). */
async function marketingMember(owner, label) {
  const email = label + '-' + runId + '@example.test',
    password = 'EquipeHomologacao!2026',
    member = new Client();
  await owner.command({
    type: 'invite.create',
    name: 'Marketing teste',
    email,
    role: 'production',
    permissions: ['marketing'],
  });
  const invite = (await owner.data('admin/operations')).invitations.find((i) => i.email === email);
  assert.equal(
    (
      await member.call('team/invitations/' + invite.token + '/accept', 'POST', {
        name: 'Marketing teste',
        password,
      })
    ).status,
    204,
  );
  assert.equal(
    (await member.call('auth/login', 'POST', { email, password, kind: 'staff' })).status,
    200,
  );
  return member;
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
function checkout(p, q, email, payment = 'pix', { groupBuyId, coupon = '', items } = {}) {
  return {
    items: items ?? [
      { productId: p.id, quantity: 1, color: p.colors[0], sizeIndex: 0, dedication: '' },
    ],
    ...(groupBuyId ? { groupBuyId } : {}),
    address: address(email),
    shipping: q.id,
    shippingQuoteId: q.quoteId,
    shippingServiceId: q.serviceId,
    coupon,
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
  await check(
    'bootstrap de produção importa somente catálogo aprovado, sem operação fictícia',
    async () => {
      const productionEnv = {
        ...env,
        NODE_ENV: 'production',
        PUBLIC_WEB_URL: 'https://shop.example.test',
        PUBLIC_API_URL: 'https://api.example.test',
        INTEGRATIONS_MODE: 'live',
        SEED_DEMO_CATALOG: 'false',
        BOOTSTRAP_EXISTING_CATALOG: 'true',
      };
      const result = spawnSync(process.execPath, ['apps/api/dist/seed.mjs', '--if-configured'], {
        cwd: root,
        env: productionEnv,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const verify = createContext(
        (await import('@maos-em-oracao/backend-core/config')).loadConfig(env),
      );
      try {
        const products = await verify.db.product.findMany();
        assert.equal(products.length, 6);
        assert(
          products.every(
            (p) =>
              p.stock === 0 &&
              !p.data.model &&
              p.data.media[0].url.startsWith(productionEnv.PUBLIC_WEB_URL),
          ),
        );
        for (const model of [
          'customer',
          'order',
          'subscription',
          'paymentIntent',
          'productionJob',
          'clubEdition',
          'printer',
          'coupon',
          'ticket',
          'prayer',
          'ledgerEntry',
        ]) {
          assert.equal(await verify.db[model].count(), 0, model);
        }
        const workspace = await verify.db.appSetting.findUniqueOrThrow({
          where: { key: 'workspace' },
        });
        assert.equal(workspace.data.originStreet, '');
        // This database was created above exclusively for this run; restore its empty bootstrap state.
        await verify.db.product.deleteMany();
        await verify.db.appSetting.deleteMany();
        await verify.db.user.deleteMany();
      } finally {
        await closeContext(verify);
      }
    },
  );
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
  await check('etiqueta automática ao ficar pronto, rastreio e entrega', async () => {
    // No manual prepare/generate: "Pronto para envio" queues the automatic label.
    await engine.dispatch();
    await until(
      async () => (await ctx.db.shipment.findUnique({ where: { orderId } }))?.state === 'ready',
      'etiqueta automática pronta',
    );
    const shipment = await ctx.db.shipment.findUnique({ where: { orderId } });
    assert.deepEqual(shipment.data.fiscal, { nonCommercial: true });
    assert.ok(shipment.labelUrl, 'etiqueta sem PDF');
    assert.equal(
      (await ctx.db.order.findUnique({ where: { id: orderId } })).status,
      'Pronto para envio',
    );
    assert.equal(
      (await ctx.db.auditEntry.count({ where: { actorId: 'system', entity: orderId } })) > 0,
      true,
    );
    await owner.command({
      type: 'shipping.dispatch',
      id: orderId,
      tracking: 'TESTE-SEM-ENVIO-1042',
      carrier: 'Homologação',
    });
    assert.equal((await ctx.db.order.findUnique({ where: { id: orderId } })).status, 'Enviado');
    const posted = await mail(orderId, 'shipment-posted');
    assert.equal(
      posted.envelope.text.includes(
        'https://www.melhorrastreio.com.br/rastreio/TESTE-SEM-ENVIO-1042',
      ),
      true,
    );
    await owner.command({ type: 'shipping.deliver', id: orderId });
    assert.equal((await ctx.db.order.findUnique({ where: { id: orderId } })).status, 'Entregue');
    assert.ok(
      (await ctx.db.order.findUnique({ where: { id: orderId } })).deliveredAt instanceof Date,
    );
  });
  const deliverNewOrder = async (client = customer, email = first.email) => {
    const q = await quote(client, product),
      bought = await buy(client, checkout(product, q, email)),
      secondOrder = bought.body.data.orderId;
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'charge.pay',
      id: ops.charges.find((c) => c.orderId === secondOrder).id,
    });
    ops = await owner.data('admin/operations');
    const job = ops.jobs.find((j) => j.orderId === secondOrder);
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
    for (let i = 0; i < 4; i++) await owner.command({ type: 'production.advance', id: job.id });
    await engine.dispatch();
    await until(
      async () =>
        (await ctx.db.shipment.findUnique({ where: { orderId: secondOrder } }))?.state === 'ready',
      'etiqueta da segunda entrega',
    );
    await owner.command({
      type: 'shipping.dispatch',
      id: secondOrder,
      tracking: 'TESTE-SEM-ENVIO-2042',
      carrier: 'Homologação',
    });
    await owner.command({ type: 'shipping.deliver', id: secondOrder });
    return secondOrder;
  };
  await check('avaliação só de quem recebeu, moderada e na nota do catálogo', async () => {
    const itemOf = (a, id) => a.orders.find((o) => o.id === id).items[0].itemId,
      review = (client, orderItemId, rating = 4) =>
        client.call('reviews', 'POST', {
          orderItemId,
          rating,
          title: 'Linda peça',
          text: 'Chegou bem embalada e o acabamento é muito bonito.',
        });
    let account = accountSchema.parse(await customer.data('account'));
    assert.ok(itemOf(account, orderId), 'itemId ausente no pedido da conta');
    const deliveredItem = itemOf(account, orderId),
      pending = account.orders.find((o) => o.id !== orderId && o.status !== 'Entregue');
    assert.equal((await review(other, deliveredItem)).status, 404);
    assert.equal((await review(guest, deliveredItem)).status, 404);
    const notDelivered = await review(customer, itemOf(account, pending.id));
    assert.equal(notDelivered.status, 409);
    assert.equal(notDelivered.body.error.code, 'NOT_DELIVERED');
    const withPhoto = await customer.call('reviews', 'POST', {
      orderItemId: deliveredItem,
      rating: 4,
      text: 'Chegou bem embalada e o acabamento é muito bonito.',
      photoIds: [randomUUID()],
    });
    assert.equal(withPhoto.status, 422);
    assert.equal(withPhoto.body.error.code, 'INVALID_PHOTO');
    const created = await review(customer, deliveredItem);
    assert.equal(created.status, 201, created.body?.error?.code);
    assert.deepEqual(created.body.data, {
      orderItemId: deliveredItem,
      rating: 4,
      status: 'Em análise',
    });
    account = accountSchema.parse(await customer.data('account'));
    assert.deepEqual(
      account.reviews.map((r) => r.orderItemId),
      [deliveredItem],
    );
    const again = await review(customer, deliveredItem);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_REVIEWED');
    let list = await customer.data('catalog/products/' + product.id + '/reviews');
    assert.equal(list.reviews.length, 0);
    assert.equal(list.summary.count, 0);
    assert.equal((await customer.data('catalog/products/' + product.id)).rating, undefined);
    ops = await owner.data('admin/operations');
    operationsSchema.parse(ops);
    const pendingReview = ops.reviews.find((r) => r.orderId === orderId);
    assert.equal(pendingReview.status, 'Em análise');
    assert.equal(pendingReview.customerEmail, first.email);
    await owner.command({
      type: 'review.moderate',
      id: pendingReview.id,
      status: 'Publicado',
      reply: 'Obrigado!',
    });
    list = await customer.data('catalog/products/' + product.id + '/reviews');
    assert.equal(list.reviews.length, 1);
    assert.equal(list.reviews[0].author, 'Cliente P.');
    assert.equal(list.reviews[0].reply, 'Obrigado!');
    assert.ok(list.reviews[0].repliedAt);
    assert.equal(list.reviews[0].variant.includes(' · '), true);
    assert(!JSON.stringify(list).includes(first.email));
    assert(!JSON.stringify(list).includes('customerId'));
    assert.deepEqual((await customer.data('catalog/products/' + product.id)).rating, {
      average: 4,
      count: 1,
    });
    assert.deepEqual(
      (await customer.data('catalog/products')).find((p) => p.id === product.id).rating,
      { average: 4, count: 1 },
    );
    const filtered = await customer.data('catalog/products/' + product.id + '/reviews?rating=5');
    assert.equal(filtered.reviews.length, 0);
    assert.equal(filtered.summary.count, 1);
    assert.equal(
      (await customer.call('catalog/products/' + product.id + '/reviews?rating=9')).status,
      422,
    );
    await owner.command({
      type: 'review.moderate',
      id: pendingReview.id,
      status: 'Oculto',
      reply: 'Obrigado!',
    });
    assert.equal((await customer.data('catalog/products/' + product.id)).rating, undefined);
    ops = await owner.data('admin/operations');
    const hidden = ops.reviews.find((r) => r.id === pendingReview.id);
    assert.equal(hidden.status, 'Oculto');
    assert.equal(hidden.repliedAt, list.reviews[0].repliedAt);
    accountSchema.parse(await customer.data('account'));
    assert.equal(
      await ctx.db.auditEntry.count({
        where: { entity: pendingReview.id, action: 'Avaliação: Oculto' },
      }),
      1,
    );

    // Auto-publish: a 5-star review on a second delivered item goes live at once.
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'workspace.save',
      settings: {
        ...ops.workspace,
        reviews: { requestEnabled: true, requestDelayDays: 7, autoPublishMinRating: 4 },
      },
    });
    const secondOrder = await deliverNewOrder();
    account = accountSchema.parse(await customer.data('account'));
    const auto = await review(customer, itemOf(account, secondOrder), 5);
    assert.equal(auto.status, 201, auto.body?.error?.code);
    assert.equal(auto.body.data.status, 'Publicado');
    assert.deepEqual((await customer.data('catalog/products/' + product.id)).rating, {
      average: 5,
      count: 1,
    });
    await owner.command({
      type: 'workspace.save',
      settings: { ...ops.workspace, reviews: undefined },
    });
  });
  await check('pedido de avaliação após a entrega, uma vez e com descadastro', async () => {
    const days = (n) => new Date(Date.now() - n * 86400000),
      backdate = (id, n) => ctx.db.order.update({ where: { id }, data: { deliveredAt: days(n) } }),
      keyCount = (id) =>
        ctx.db.outboxEvent
          .findMany({ where: { aggregateId: id, kind: 'email' } })
          .then(
            (rows) =>
              rows.filter((r) => unseal(r.payloadEncrypted, ctx.config).kind === 'review-request')
                .length,
          ),
      requestedAt = async (id) =>
        (await ctx.db.order.findUniqueOrThrow({ where: { id } })).reviewRequestedAt;
    const eligible = await deliverNewOrder(),
      optOutOrder = await deliverNewOrder(other, second.email),
      recent = await deliverNewOrder();
    await backdate(eligible, 8);
    await backdate(optOutOrder, 8);
    await backdate(recent, 3);
    await engine.tick();
    const sent = await mail(eligible, 'review-request');
    assert.equal(sent.envelope.subject, 'Como ficou sua peça? · Mãos em Oração');
    assert.match(sent.envelope.html, /\/avaliacoes\/descadastro\?token=/);
    assert.ok(await requestedAt(eligible));
    assert.equal(await keyCount(recent), 0);
    assert.equal(await requestedAt(recent), null);
    await engine.tick();
    assert.equal(await keyCount(eligible), 1);

    // The recipient opts out with the signed token from the e-mail.
    const opted = await mail(optOutOrder, 'review-request'),
      link = /avaliacoes\/descadastro\?token=([^"&\s]+)/.exec(opted.envelope.html);
    assert.ok(link);
    const token = decodeURIComponent(link[1]);
    assert.equal(
      (await new Client().call('reviews/opt-out', 'POST', { token: 'x'.repeat(30) })).status,
      422,
    );
    assert.equal((await new Client().call('reviews/opt-out', 'POST', { token })).status, 204);
    assert.equal(
      (await ctx.db.customer.findFirstOrThrow({ where: { email: second.email } }))
        .reviewRequestsOptOut,
      true,
    );
    const afterOptOut = await deliverNewOrder(other, second.email);
    await backdate(afterOptOut, 8);
    await engine.tick();
    assert.equal(await keyCount(afterOptOut), 0);
    assert.equal(await requestedAt(afterOptOut), null);

    // Guest checkouts create a Customer per order: the opt-out must hold for the e-mail.
    const guestEmail = 'descadastro-' + runId + '@example.test',
      guestA = await deliverNewOrder(new Client(), guestEmail);
    await backdate(guestA, 8);
    await engine.tick();
    const guestMail = await mail(guestA, 'review-request'),
      guestToken = decodeURIComponent(
        /avaliacoes\/descadastro\?token=([^"&\s]+)/.exec(guestMail.envelope.html)[1],
      );
    // A newsletter unsubscribe token cannot be replayed as a review opt-out.
    const { Notifications: Links } = await import('@maos-em-oracao/backend-core/notifications'),
      newsletterToken = new URL(
        new Links(ctx).unsubscribeLinks('subscriber', 1).oneClickUnsubscribeUrl,
      ).searchParams.get('token');
    assert.equal(
      (await new Client().call('reviews/opt-out', 'POST', { token: newsletterToken })).status,
      422,
    );
    assert.equal(
      await ctx.db.customer.count({
        where: { email: guestEmail, reviewRequestsOptOut: true },
      }),
      0,
    );
    assert.equal(
      (await new Client().call('reviews/opt-out', 'POST', { token: guestToken })).status,
      204,
    );
    const guestB = await deliverNewOrder(new Client(), guestEmail.toUpperCase());
    await backdate(guestB, 8);
    await engine.tick();
    assert.equal(await keyCount(guestB), 0);
    assert.ok(await requestedAt(guestB), 'claimed so it is not re-evaluated forever');

    // With requests disabled nothing is sent and the order stays eligible for later.
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'workspace.save',
      settings: {
        ...ops.workspace,
        reviews: { requestEnabled: false, requestDelayDays: 7, autoPublishMinRating: null },
      },
    });
    const whileDisabled = await deliverNewOrder();
    await backdate(whileDisabled, 8);
    await engine.tick();
    assert.equal(await keyCount(whileDisabled), 0);
    assert.equal(await requestedAt(whileDisabled), null);
    await owner.command({
      type: 'workspace.save',
      settings: { ...ops.workspace, reviews: undefined },
    });
  });
  await check('fotos da avaliação: só imagem do próprio cliente', async () => {
    const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#3e4934' },
      })
        .png()
        .toBuffer(),
      upload = async (client, name, bytes, steps = 3) => {
        const session = await client.call('reviews/uploads', 'POST', {
          name,
          mime: name.endsWith('.png') ? 'image/png' : 'text/plain',
          size: bytes.length,
          kind: 'image',
        });
        if (session.status !== 200) return { session };
        const path = 'reviews/uploads/' + session.body.data.id,
          put = await client.call(path + '/content', 'PUT', undefined, { bytes });
        return { session, put, path, id: session.body.data.id };
      };
    const ok = await upload(customer, 'foto.png', png);
    assert.equal(ok.session.status, 200, ok.session.body?.error?.code);
    assert.equal(ok.session.body.data.url, '/api/v1/' + ok.path + '/content');
    assert.equal(ok.put.status, 204, ok.put.body?.error?.code);
    assert.equal((await other.call(ok.path + '/complete', 'POST', {})).status, 404);
    assert.equal(
      (await other.call(ok.path + '/content', 'PUT', undefined, { bytes: png })).status,
      404,
    );
    assert.equal((await new Client().call('reviews/uploads', 'POST', {})).status, 401);
    const done = await customer.call(ok.path + '/complete', 'POST', {});
    assert.equal(done.status, 200, done.body?.error?.code);
    assert.equal(done.body.data.status, 'ready');
    assert.match(done.body.data.url, /^(https:\/\/|\/api\/media\/public\/)/);
    const asset = await ctx.db.mediaAsset.findUnique({ where: { id: ok.id } });
    assert.ok(asset.uploaderId.startsWith('customer/'));
    // Only images: a model declaration and a text file posing as an image both fail.
    assert.equal(
      (
        await customer.call('reviews/uploads', 'POST', {
          name: 'modelo.stl',
          mime: 'application/octet-stream',
          size: 10,
          kind: 'model',
        })
      ).status,
      422,
    );
    const fake = await upload(customer, 'falso.png', Buffer.from('isto não é uma imagem'));
    assert.equal(fake.put.status, 422);
    assert.equal(fake.put.body.error.code, 'INVALID_IMAGE');
    assert.equal(
      (await customer.call(fake.path + '/complete', 'POST', {})).body.data.status,
      'failed',
    );
    const big = await customer.call('reviews/uploads', 'POST', {
      name: 'grande.png',
      mime: 'image/png',
      size: 9 * 1024 * 1024,
      kind: 'image',
    });
    assert.equal(big.status, 413);

    const itemOf = (a, id) => a.orders.find((o) => o.id === id).items[0].itemId,
      post = (client, orderItemId, photoIds, rating = 5) =>
        client.call('reviews', 'POST', {
          orderItemId,
          rating,
          text: 'Chegou bem embalada e o acabamento é muito bonito.',
          photoIds,
        }),
      thirdOrder = await deliverNewOrder(),
      account = accountSchema.parse(await customer.data('account')),
      item = itemOf(account, thirdOrder);
    const otherOrder = await deliverNewOrder(other, second.email),
      otherItem = itemOf(accountSchema.parse(await other.data('account')), otherOrder);
    const stolen = await post(other, otherItem, [ok.id]);
    assert.equal(stolen.status, 422);
    assert.equal(stolen.body.error.code, 'INVALID_PHOTO');
    const unfinished = await upload(customer, 'pendente.png', png);
    assert.equal(
      (await post(customer, item, [unfinished.id])).body.error.code,
      'INVALID_PHOTO',
      'foto sem concluir',
    );
    assert.equal(
      (await post(customer, item, [ok.id, ok.id])).body.error.code,
      'INVALID_PHOTO',
      'foto repetida',
    );
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'workspace.save',
      settings: {
        ...ops.workspace,
        reviews: { requestEnabled: true, requestDelayDays: 7, autoPublishMinRating: 4 },
      },
    });
    const created = await post(customer, item, [ok.id]);
    assert.equal(created.status, 201, created.body?.error?.code);
    assert.equal(created.body.data.status, 'Em análise');
    assert.equal(
      (await ctx.db.review.findUnique({ where: { orderItemId: item } })).photos[0].assetId,
      ok.id,
    );
    ops = await owner.data('admin/operations');
    const row = ops.reviews.find((r) => r.orderId === thirdOrder);
    await owner.command({ type: 'review.moderate', id: row.id, status: 'Publicado', reply: '' });
    const list = await customer.data('catalog/products/' + product.id + '/reviews');
    assert.equal(list.reviews.find((r) => r.id === row.id).photos[0].url, done.body.data.url);
    // The same photo cannot illustrate a second review.
    const fourth = await deliverNewOrder(),
      reuse = await post(
        customer,
        itemOf(accountSchema.parse(await customer.data('account')), fourth),
        [ok.id],
      );
    assert.equal(reuse.body.error.code, 'INVALID_PHOTO');
    await owner.command({ type: 'review.moderate', id: row.id, status: 'Oculto', reply: '' });
    ops = await owner.data('admin/operations');
    await owner.command({
      type: 'workspace.save',
      settings: { ...ops.workspace, reviews: undefined },
    });
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
      // The guest reviews the delivered piece before the account exists.
      await ctx.db.order.update({
        where: { id },
        data: { status: 'Entregue', deliveredAt: new Date() },
      });
      const guestItem = (await fresh.data('account')).orders[0].items[0].itemId,
        guestReview = {
          orderItemId: guestItem,
          rating: 5,
          title: 'Linda peça',
          text: 'Chegou bem embalada e o acabamento é muito bonito.',
        };
      assert.equal((await fresh.call('reviews', 'POST', guestReview)).status, 201);
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
      // After the merge the review follows the order: no "Avaliar" again, no duplicate.
      assert.deepEqual(
        (await account.data('account')).reviews.map((r) => r.orderItemId),
        [guestItem],
      );
      const dup = await account.call('reviews', 'POST', guestReview);
      assert.equal(dup.status, 409);
      assert.equal(dup.body.error.code, 'ALREADY_REVIEWED');
      const guestAccount = await fresh.data('account');
      assert.equal(guestAccount.orders.length, 1);
      assert.equal(guestAccount.tickets.length, 0);
      assert.equal(guestAccount.subscriptions.length, 0);
      assert.deepEqual(
        guestAccount.reviews.map((r) => r.orderItemId),
        [guestItem],
      );
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
    await owner.command({
      type: 'coupon.save',
      coupon: {
        id: randomUUID(),
        code,
        active: true,
        limit: 10,
        used: 0,
        kind: 'fixed',
        amount: 1700,
        minimumCents: 0,
        startsAt: '2020-01-01',
        endsAt: '2099-12-31',
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
  await check(
    'oração diária automática: uma por dia, no horário e sem atropelar a manual',
    async () => {
      const email = 'auto-prayer-' + runId + '@example.test';
      await ctx.db.devotionalSubscriber.upsert({
        where: { email },
        create: {
          email,
          name: 'Leitora',
          consentVersion: 'prayer-v1',
          consentAt: new Date(),
          verifiedAt: new Date(),
        },
        update: { verifiedAt: new Date(), unsubscribedAt: null },
      });
      const original = await ctx.db.appSetting.findUniqueOrThrow({ where: { key: 'workspace' } });
      const setWorkspace = (extra) =>
        ctx.db.appSetting.update({
          where: { key: 'workspace' },
          data: { data: { ...original.data, prayerSendHour: '06:00', ...extra } },
        });
      try {
        await setWorkspace({ dailyPrayerAuto: true });
        // 05:00 in Brasília: too early.
        assert.equal(await engine.scheduleDailyPrayer(new Date('2030-03-10T08:00:00Z')), null);
        const id = await engine.scheduleDailyPrayer(new Date('2030-03-10T10:00:00Z'));
        assert.ok(id, 'oração do dia não foi agendada');
        assert.equal(await engine.scheduleDailyPrayer(new Date('2030-03-10T20:00:00Z')), null);
        const created = await ctx.db.campaign.findUniqueOrThrow({ where: { id } });
        assert.equal(created.subject, prayerForDay('2030-03-10').title);
        assert.equal(created.state, 'Agendada');
        // A prayer scheduled by the team for the day wins.
        await ctx.db.campaign.create({
          data: {
            subject: 'Oração da equipe',
            message: 'Oração escrita pela equipe para este dia.',
            state: 'Agendada',
            scheduledAt: new Date('2030-03-11T09:30:00Z'),
          },
        });
        assert.equal(await engine.scheduleDailyPrayer(new Date('2030-03-11T10:00:00Z')), null);
        await setWorkspace({ dailyPrayerAuto: false });
        assert.equal(await engine.scheduleDailyPrayer(new Date('2030-03-12T10:00:00Z')), null);
      } finally {
        await ctx.db.appSetting.update({
          where: { key: 'workspace' },
          data: { data: original.data },
        });
        await ctx.db.campaign.deleteMany({
          where: { scheduledAt: { gte: new Date('2030-03-01T00:00:00Z') } },
        });
      }
    },
  );
  await check('frete usa a caixa do tamanho escolhido', async () => {
    const row = await ctx.db.product.findUniqueOrThrow({ where: { id: product.id } });
    const base = { weightGrams: 300, widthCm: 15, heightCm: 20, lengthCm: 15 };
    const big = { weightGrams: 900, widthCm: 25, heightCm: 32, lengthCm: 25 };
    await ctx.db.product.update({
      where: { id: product.id },
      data: {
        data: { ...row.data, shipping: { ...base, leadTimeDays: 5, bySize: [base, big] } },
      },
    });
    try {
      const quoted = async (sizeIndex) => {
        const r = await customer.call('shipping/quotes', 'POST', {
          cep: '01001-000',
          items: [{ productId: product.id, quantity: 1, sizeIndex }],
        });
        assert.equal(r.status, 200, r.body?.error?.code);
        const q = await ctx.db.shippingQuote.findUniqueOrThrow({
          where: { id: r.body.data[0].quoteId },
        });
        return q.data.products[0];
      };
      assert.equal((await quoted(0)).weightGrams, 300);
      const large = await quoted(1);
      assert.equal(large.weightGrams, 900);
      assert.equal(large.heightCm, 32);
    } finally {
      await ctx.db.product.update({ where: { id: product.id }, data: { data: row.data } });
    }
  });
  await check('cookie de sessão expira junto com a sessão do servidor', async () => {
    // Only the session cookie: the visitor cookie lives for a year on purpose.
    const maxAge = (r) =>
      Number(
        /max-age=(\d+)/i.exec(
          r.headers.getSetCookie().find((c) => c.startsWith('meo_session=')) || '',
        )?.[1] || 0,
      );
    const staff = await new Client().call('auth/login', 'POST', {
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      password: env.BOOTSTRAP_ADMIN_PASSWORD,
      kind: 'staff',
    });
    assert.equal(staff.status, 200);
    assert.ok(maxAge(staff) > 7 * 3600 && maxAge(staff) <= 8 * 3600, 'equipe: ' + maxAge(staff));
    const shopper = await new Client().call('auth/login', 'POST', {
      name: 'Cookie de teste',
      email: 'cookie-' + runId + '@example.test',
      password: 'IntegrationTeste!2026',
      kind: 'customer',
      register: true,
    });
    assert.ok(maxAge(shopper) > 6 * 86400, 'cliente: ' + maxAge(shopper));
  });
  await check('custo congelado no item e exclusão segura de pedido e cliente', async () => {
    const buyer = new Client(),
      who = await register(buyer, 'excluir'),
      placed = await buy(buyer, checkout(product, await quote(buyer, product), who.email));
    assert.equal(placed.status, 200, placed.body?.error?.code);
    const orderId = placed.body.data.orderId,
      line = await ctx.db.orderItem.findFirstOrThrow({ where: { orderId } }),
      current = await ctx.db.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(line.costCents, current.costCents * line.quantity);
    const customerId = (await ctx.db.order.findUniqueOrThrow({ where: { id: orderId } }))
      .customerId;
    const del = (command) =>
      owner.call('admin/commands', 'POST', command, {
        headers: { 'idempotency-key': randomUUID() },
      });
    const blocked = await del({ type: 'customer.delete', id: customerId });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'CUSTOMER_HAS_HISTORY');
    await owner.command({
      type: 'order.update',
      id: orderId,
      status: 'Cancelado',
      priority: 'Normal',
      due: new Date().toISOString(),
      notes: '',
    });
    // The Pix issued at the provider must be closed before the order can disappear.
    await until(async () => {
      const r = await del({ type: 'order.delete', id: orderId });
      if (r.status === 409) assert.equal(r.body.error.code, 'CANCEL_FIRST');
      return r.status === 204;
    }, 'pedido cancelado não pôde ser excluído');
    assert.equal(await ctx.db.order.count({ where: { id: orderId } }), 0);
    assert.equal(await ctx.db.paymentIntent.count({ where: { orderId } }), 0);
    assert.equal((await del({ type: 'customer.delete', id: customerId })).status, 204);
    assert.equal(await ctx.db.customer.count({ where: { id: customerId } }), 0);
    const paid = await ctx.db.order.findFirst({
      where: { payment: { parts: { some: { status: 'approved' } } } },
    });
    if (paid) {
      const refused = await del({ type: 'order.delete', id: paid.id });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error.code, 'ORDER_HAS_PAYMENT');
    }
  });
  await check('preço e custo por tamanho no pedido', async () => {
    const ops2 = await owner.data('admin/operations'),
      base = ops2.products.find((p) => p.id === product.id),
      part = (n) => ({
        materialCents: n,
        packagingCents: 0,
        energyCents: 0,
        laborCents: 0,
        otherCents: 0,
      }),
      sizes = [...base.sizes, 'Tamanho extra 1', 'Tamanho extra 2'].slice(0, 3);
    const sized = {
      ...base,
      sizes,
      stock: Math.max(base.stock, 20),
      sizePrices: [9990, 12990, 15990],
      costBySize: [part(1000), part(1800), part(2600)],
    };
    await owner.command({ type: 'product.save', product: sized });
    try {
      const q = await customer.call('shipping/quotes', 'POST', {
        cep: '01001-000',
        items: [{ productId: product.id, quantity: 2, sizeIndex: 2 }],
      });
      assert.equal(q.status, 200, q.body?.error?.code);
      const shipQuote = q.body.data[0],
        saved = await ctx.db.shippingQuote.findUniqueOrThrow({ where: { id: shipQuote.quoteId } });
      assert.equal(saved.data.products[0].insuranceCents, 15990);
      const who = await register(customer, 'tamanho'),
        body = checkout(product, shipQuote, who.email);
      body.items = [{ ...body.items[0], quantity: 2, sizeIndex: 2 }];
      const placed = await buy(customer, body);
      assert.equal(placed.status, 200, placed.body?.error?.code);
      const order = await ctx.db.order.findUniqueOrThrow({
          where: { id: placed.body.data.orderId },
          include: { items: true },
        }),
        line = order.items[0];
      assert.equal(order.subtotalCents, 15990 * 2);
      assert.equal(line.unitCents, 15990);
      assert.equal(line.costCents, 2600 * 2);
      const mismatch = await owner.call(
        'admin/commands',
        'POST',
        { type: 'product.save', product: { ...sized, sizePrices: [9990, 12990] } },
        { headers: { 'idempotency-key': randomUUID() } },
      );
      assert.equal(mismatch.status, 422);
      assert.equal(mismatch.body.error.code, 'INVALID_PRICES');
      const row = await ctx.db.product.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(row.priceCents, 9990);
      assert.equal(row.costCents, 1000);
      const pub = await guest.data('catalog/products/' + product.id);
      assert.deepEqual(pub.sizePrices, [9990, 12990, 15990]);
      assert(!('costBySize' in pub) && !('costBreakdown' in pub) && !('costCents' in pub));
    } finally {
      await owner.command({ type: 'product.save', product: base });
    }
  });
  await check('kit: cadastro validado, catálogo com resumo e exclusões', async () => {
    const ops2 = await owner.data('admin/operations'),
      template = ops2.products.find((p) => p.id === product.id),
      part = (n, packagingCents = 0) => ({
        materialCents: n,
        packagingCents,
        energyCents: 0,
        laborCents: 0,
        otherCents: 0,
      }),
      base = {
        ...template,
        active: true,
        archived: false,
        stock: 10,
        colors: ['Branco', 'Preto'],
        sizes: ['Pequeno', 'Médio'],
        sizePrices: [5000, 8000],
        costBySize: [part(1000), part(1800)],
      },
      A = { ...base, id: randomUUID(), sku: 'KIT-A-' + runId, name: 'Componente A' },
      B = { ...base, id: randomUUID(), sku: 'KIT-B-' + runId, name: 'Componente B' };
    delete A.kit;
    delete B.kit;
    await owner.command({ type: 'product.save', product: A });
    await owner.command({ type: 'product.save', product: B });
    const save = (kit, extra = {}) =>
        owner.call(
          'admin/commands',
          'POST',
          { type: 'product.save', product: { ...kit, ...extra } },
          { headers: { 'idempotency-key': randomUUID() } },
        ),
      comp = (p, sizeIndex, quantity, color = 'Branco') => ({
        productId: p.id,
        sizeIndex,
        color,
        quantity,
      }),
      kit = {
        ...base,
        id: randomUUID(),
        sku: 'KIT-' + runId,
        name: 'Kit de teste',
        priceCents: 17990,
        stock: 99,
        sizes: ['Qualquer'],
        colors: ['Qualquer'],
        sizePrices: [1],
        costBreakdown: part(0, 300),
        costBySize: [part(7)],
        kit: { components: [comp(A, 1, 2), comp(B, 0, 1, null)] },
      };
    const saved = await save(kit);
    assert.equal(saved.status, 204, saved.body?.error?.code);
    const row = await ctx.db.product.findUniqueOrThrow({ where: { id: kit.id } });
    assert.equal(row.stock, 0);
    assert.equal(row.costCents, 2 * 1800 + 1000 + 300);
    assert.deepEqual(row.data.sizes, ['Kit completo']);
    assert.deepEqual(row.data.colors, ['Padrão']);
    assert(!('sizePrices' in row.data) && !('costBySize' in row.data));
    assert(!('kitSummary' in row.data));
    // A client-sent kitSummary is never persisted.
    await save(kit, {
      kitSummary: { pieces: 1, componentsTotalCents: 1, savingsCents: 1, items: [] },
    });
    assert(
      !('kitSummary' in (await ctx.db.product.findUniqueOrThrow({ where: { id: kit.id } })).data),
    );
    const pub = await guest.data('catalog/products/' + kit.id);
    assert.equal(pub.kitSummary.pieces, 3);
    assert.equal(pub.kitSummary.componentsTotalCents, 2 * 8000 + 5000);
    assert.equal(pub.kitSummary.savingsCents, 21000 - 17990);
    assert.equal(pub.kitSummary.items.length, 2);
    assert.equal(pub.stock, 5);
    assert.deepEqual(pub.sizes, ['Kit completo']);
    assert(!('costCents' in pub) && !('costBreakdown' in pub));
    assert((await guest.data('catalog/products')).some((p) => p.id === kit.id));
    for (const [bad, code] of [
      [{ components: [comp({ id: randomUUID() }, 0, 2)] }, 'INVALID_KIT'],
      [{ components: [comp(A, 5, 2)] }, 'INVALID_KIT'],
      [{ components: [comp(A, 0, 2, 'Verde')] }, 'INVALID_KIT'],
      [{ components: [comp(A, 0, 1), comp(kit, 0, 1)] }, 'INVALID_KIT'],
    ]) {
      const r = await save(
        { ...kit, id: randomUUID(), sku: 'KIT-X-' + randomUUID() },
        { kit: bad },
      );
      assert.equal(r.status, 422, JSON.stringify(r.body));
      assert.equal(r.body.error.code, code);
    }
    const short = await save(
      { ...kit, id: randomUUID(), sku: 'KIT-S-' + randomUUID() },
      { kit: { components: [comp(A, 0, 1)] } },
    );
    assert.equal(short.status, 422);
    assert.equal(short.body.error.code, 'INVALID_KIT');
    const newSelf = { ...kit, id: randomUUID(), sku: 'KIT-N-' + randomUUID() },
      selfNew = await save(newSelf, { kit: { components: [comp(newSelf, 0, 2)] } });
    assert.equal(selfNew.status, 422);
    assert.match(selfNew.body.error.message, /a si mesmo/);
    // Turning a product with stock into a kit zeroes it with a movement; reservations block it.
    const conv = { ...base, id: randomUUID(), sku: 'KIT-C-' + randomUUID(), name: 'Conversão' };
    delete conv.kit;
    await owner.command({ type: 'product.save', product: conv });
    await ctx.db.product.update({ where: { id: conv.id }, data: { reserved: 1 } });
    const blocked = await save(conv, { kit: { components: [comp(A, 0, 2)] } });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error.message, /transformá-lo em kit/);
    await ctx.db.product.update({ where: { id: conv.id }, data: { reserved: 0 } });
    assert.equal((await save(conv, { kit: { components: [comp(A, 0, 2)] } })).status, 204);
    assert.equal(
      await ctx.db.stockMovement.count({
        where: { productId: conv.id, reason: 'Produto transformado em kit.', delta: -10 },
      }),
      1,
    );
    const self = await save(kit, { kit: { components: [comp(kit, 0, 2)] } });
    assert.equal(self.status, 422);
    assert.equal(self.body.error.code, 'INVALID_KIT');
    // Hidden while any component is archived; the public detail behaves like an inactive product.
    await owner.command({ type: 'product.save', product: { ...B, archived: true } });
    try {
      assert(!(await guest.data('catalog/products')).some((p) => p.id === kit.id));
      const hidden = await guest.call('catalog/products/' + kit.id);
      assert(
        hidden.status === 404 || hidden.body.data === null,
        'kit com componente arquivado deve sumir',
      );
    } finally {
      await owner.command({ type: 'product.save', product: B });
    }
    assert.equal((await guest.call('catalog/products/' + kit.id)).body.data.id, kit.id);
    // A component edited into an invalid state (size removed) hides the kit until restored.
    await owner.command({
      type: 'product.save',
      product: { ...A, sizes: ['Pequeno'], sizePrices: [5000], costBySize: [part(1000)] },
    });
    try {
      assert(!(await guest.data('catalog/products')).some((p) => p.id === kit.id));
      const shrunk = await guest.call('catalog/products/' + kit.id);
      assert(shrunk.status === 404 || shrunk.body.data === null, 'kit com tamanho removido');
    } finally {
      await owner.command({ type: 'product.save', product: A });
    }
    assert.equal((await guest.call('catalog/products/' + kit.id)).body.data.id, kit.id);
    // A component of a live kit cannot itself become a kit.
    const nested = await save(A, { kit: { components: [comp(B, 0, 2)] } });
    assert.equal(nested.status, 422, JSON.stringify(nested.body));
    assert.equal(nested.body.error.code, 'INVALID_KIT');
    assert.match(nested.body.error.message, /faz parte de um kit/);
    // Kits are not allowed in club editions or manual orders.
    const edition = await owner.call(
      'admin/commands',
      'POST',
      {
        type: 'edition.save',
        edition: {
          id: randomUUID(),
          name: 'Edição com kit',
          month: '2031-01',
          dispatchDay: 10,
          status: 'Rascunho',
          profiles: { Católica: [kit.id], Evangélica: [kit.id], Cristã: [kit.id] },
          message: '',
          notes: '',
        },
      },
      { headers: { 'idempotency-key': randomUUID() } },
    );
    assert.equal(edition.status, 422, JSON.stringify(edition.body));
    assert.equal(edition.body.error.code, 'KIT_NOT_ALLOWED');
    const customerRow = await ctx.db.customer.findFirstOrThrow(),
      manual = await owner.call(
        'admin/commands',
        'POST',
        {
          type: 'order.create',
          customerId: customerRow.id,
          productId: kit.id,
          quantity: 1,
          shippingCents: 1000,
          paid: false,
          due: '2031-01-10',
        },
        { headers: { 'idempotency-key': randomUUID() } },
      );
    assert.equal(manual.status, 422, JSON.stringify(manual.body));
    assert.equal(manual.body.error.code, 'KIT_NOT_ALLOWED');
  });
  await check('kit: compra reserva e baixa componentes, custo congelado e produção', async () => {
    ops = await owner.data('admin/operations');
    const policy = ops.workspace,
      template = ops.products.find((p) => p.id === product.id),
      part = (n, packagingCents = 0) => ({
        materialCents: n,
        packagingCents,
        energyCents: 0,
        laborCents: 0,
        otherCents: 0,
      }),
      base = {
        ...template,
        active: true,
        archived: false,
        stock: 5,
        colors: ['Branco', 'Preto'],
        sizes: ['Pequeno', 'Médio'],
        sizePrices: [5000, 8000],
        costBySize: [part(1000), part(1800)],
      },
      A = { ...base, id: randomUUID(), sku: 'KB-A-' + runId, name: 'Peça A' },
      B = { ...base, id: randomUUID(), sku: 'KB-B-' + runId, name: 'Peça B', stock: 4 };
    delete A.kit;
    delete B.kit;
    await owner.command({ type: 'product.save', product: A });
    await owner.command({ type: 'product.save', product: B });
    const kit = {
      ...base,
      id: randomUUID(),
      sku: 'KB-' + runId,
      name: 'Kit de compra',
      priceCents: 17990,
      stock: 0,
      sizes: ['Kit completo'],
      colors: ['Padrão'],
      sizePrices: undefined,
      costBySize: undefined,
      costBreakdown: part(0, 300),
      kit: {
        components: [
          { productId: A.id, sizeIndex: 0, color: 'Branco', quantity: 2 },
          { productId: B.id, sizeIndex: 1, color: null, quantity: 1 },
        ],
      },
    };
    const kitCost = 2 * 1000 + 1800 + 300;
    await owner.command({ type: 'product.save', product: kit });
    await owner.command({
      type: 'workspace.save',
      settings: { ...policy, inventoryPolicy: 'stock' },
    });
    const kitLine = (quantity = 1) => ({
        productId: kit.id,
        quantity,
        color: 'Padrão',
        sizeIndex: 0,
        dedication: '',
      }),
      lineA = { productId: A.id, quantity: 1, color: 'Branco', sizeIndex: 0, dedication: '' },
      quoteItems = async (client, items) => {
        const r = await client.call('shipping/quotes', 'POST', {
          cep: '01001-000',
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            sizeIndex: i.sizeIndex,
          })),
        });
        assert.equal(r.status, 200, r.body?.error?.code);
        return r.body.data[0];
      },
      body = (q, items, email) => ({ ...checkout(product, q, email), items }),
      stockOf = async (id) => ctx.db.product.findUniqueOrThrow({ where: { id } });
    try {
      const items = [kitLine(), lineA],
        q = await quoteItems(customer, items),
        r = await buy(customer, body(q, items, first.email));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const orderKit = r.body.data.orderId;
      assert.equal((await stockOf(A.id)).reserved, 3);
      assert.equal((await stockOf(B.id)).reserved, 1);
      assert.equal((await stockOf(kit.id)).reserved, 0);
      const reservations = await ctx.db.stockReservation.findMany({ where: { orderId: orderKit } });
      assert.equal(reservations.length, 2);
      assert.equal(reservations.find((x) => x.productId === A.id).quantity, 3);
      assert.equal(reservations.find((x) => x.productId === B.id).quantity, 1);
      const rows = await ctx.db.orderItem.findMany({ where: { orderId: orderKit } }),
        kitRow = rows.find((x) => x.productId === kit.id);
      assert.equal(kitRow.costCents, kitCost);
      assert.equal(kitRow.data.size, 'Kit completo');
      assert.deepEqual(kitRow.data.kit.items, [
        {
          productId: A.id,
          name: 'Peça A',
          size: 'Pequeno',
          sizeIndex: 0,
          color: 'Branco',
          quantity: 2,
        },
        { productId: B.id, name: 'Peça B', size: 'Médio', sizeIndex: 1, color: null, quantity: 1 },
      ]);
      // A second buyer needs 4 of A (2 kits) but only 2 are available: nothing is reserved.
      const reservedBefore = await ctx.db.stockReservation.count(),
        q2 = await quoteItems(other, [kitLine(2)]),
        over = await buy(other, body(q2, [kitLine(2)], second.email));
      assert.equal(over.status, 409, JSON.stringify(over.body));
      assert.equal(over.body.error.code, 'OUT_OF_STOCK');
      assert.equal(await ctx.db.stockReservation.count(), reservedBefore);
      assert.equal((await stockOf(A.id)).reserved, 3);
      assert.equal((await stockOf(B.id)).reserved, 1);
      // Payment consumes the component reservations and releases production once.
      ops = await owner.data('admin/operations');
      const charge = ops.charges.find((c) => c.orderId === orderKit);
      await owner.command({ type: 'charge.pay', id: charge.id });
      const a = await stockOf(A.id),
        b = await stockOf(B.id);
      assert.deepEqual([a.stock, a.reserved, b.stock, b.reserved], [2, 0, 3, 0]);
      assert.equal(await ctx.db.productionJob.count({ where: { orderId: orderKit } }), 1);
      ops = await owner.data('admin/operations');
      const adminItem = ops.orders
        .find((o) => o.id === orderKit)
        .items.find((i) => i.productId === kit.id);
      assert.equal(adminItem.kit.items.length, 2);
      // A component edit invalidates an old quote of the kit.
      const stale = await quoteItems(customer, [kitLine()]);
      await owner.command({
        type: 'product.save',
        product: { ...A, priceCents: 5100, sizePrices: [5100, 8000] },
      });
      const expired = await buy(customer, body(stale, [kitLine()], first.email));
      assert.equal(expired.status, 409, JSON.stringify(expired.body));
      assert.equal(expired.body.error.code, 'QUOTE_EXPIRED');
      // An archived component makes the kit unavailable.
      const fresh = await quoteItems(customer, [kitLine()]);
      await owner.command({ type: 'product.save', product: { ...B, stock: 3, archived: true } });
      try {
        const gone = await buy(customer, body(fresh, [kitLine()], first.email));
        assert.equal(gone.status, 409, JSON.stringify(gone.body));
        assert.equal(gone.body.error.code, 'KIT_UNAVAILABLE');
      } finally {
        await owner.command({ type: 'product.save', product: { ...B, stock: 3 } });
      }
      // A component edited into an invalid state (size removed) makes the kit unavailable too.
      const shrunkQuote = await quoteItems(customer, [kitLine()]);
      await owner.command({
        type: 'product.save',
        product: {
          ...B,
          stock: 3,
          sizes: ['Pequeno'],
          sizePrices: [5000],
          costBySize: [part(1000)],
        },
      });
      try {
        const bad = await buy(customer, body(shrunkQuote, [kitLine()], first.email));
        assert.equal(bad.status, 409, JSON.stringify(bad.body));
        assert.equal(bad.body.error.code, 'KIT_UNAVAILABLE');
      } finally {
        await owner.command({ type: 'product.save', product: { ...B, stock: 3 } });
      }
    } finally {
      await owner.command({
        type: 'workspace.save',
        settings: { ...policy, inventoryPolicy: 'on-demand' },
      });
    }
  });
  let groupBuyId;
  await check('compra coletiva: admin cria, loja mostra e só marketing mexe', async () => {
    const send = (command) =>
        owner.call('admin/commands', 'POST', command, {
          headers: { 'idempotency-key': randomUUID() },
        }),
      current = (await owner.data('admin/operations')).products.find((p) => p.id === product.id),
      normalCents = current.sizePrices?.[0] ?? current.priceCents,
      input = {
        type: 'groupbuy.save',
        title: 'Compra coletiva de teste',
        description: 'Quanto mais gente, melhor o preço.',
        productId: product.id,
        sizeIndex: 0,
        groupPriceCents: normalCents - 1500,
        goal: 2,
        maxParticipants: null,
        perPersonLimit: 2,
        mode: 'hold',
        endsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        active: true,
      };
    const notLower = await send({ ...input, groupPriceCents: normalCents });
    assert.equal(notLower.status, 422);
    assert.equal(notLower.body.error.code, 'GROUP_PRICE_NOT_LOWER');
    await owner.command(input);
    let groupBuys = (await owner.data('admin/operations')).groupBuys;
    assert.equal(groupBuys.length, 1);
    const [row] = groupBuys;
    groupBuyId = row.id;
    assert.equal(row.participants, 0);
    assert.equal(row.status, 'Aberta');
    assert.equal(row.locked, false);
    assert.deepEqual(row.orders, []);
    assert.equal(row.normalPriceCents, normalCents);
    assert.equal(row.groupPriceCents, normalCents - 1500);
    assert(Number.isInteger(row.costCents), 'admin recebe o custo do tamanho');
    const duplicate = await send({ ...input, title: 'Outra campanha do mesmo produto' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'GROUP_BUY_EXISTS');
    const list = await guest.data('group-buys');
    assert.deepEqual(
      list.map((g) => g.id),
      [groupBuyId],
    );
    assert.equal(list[0].productId, product.id);
    const shown = await guest.data('catalog/products/' + product.id);
    assert.equal(shown.groupBuy.goal, 2);
    assert.equal(shown.groupBuy.participants, 0);
    assert.equal(shown.groupBuy.remaining, 2);
    assert.equal(shown.groupBuy.mode, 'hold');
    assert(
      (await guest.data('catalog/products')).find((p) => p.id === product.id).groupBuy,
      'listagem traz a campanha',
    );
    assert.equal((await guest.data('group-buys/' + groupBuyId)).title, input.title);
    const pub = JSON.stringify([list, shown.groupBuy]);
    assert(!/costCents|"email"|customerName/.test(pub), 'rota pública não expõe custo nem cliente');
    const early = await send({
      type: 'groupbuy.extend',
      id: groupBuyId,
      endsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(early.status, 422);
    assert.equal(early.body.error.code, 'INVALID_END');
    const later = new Date(Date.now() + 4 * 86400000).toISOString();
    await owner.command({ type: 'groupbuy.extend', id: groupBuyId, endsAt: later });
    groupBuys = (await owner.data('admin/operations')).groupBuys;
    assert.equal(groupBuys[0].endsAt, later);
    const denied = await customer.call(
      'admin/commands',
      'POST',
      { type: 'groupbuy.close', id: groupBuyId },
      { headers: { 'idempotency-key': randomUUID() } },
    );
    assert.equal(denied.status, 403);
    assert.equal(
      (await owner.data('admin/operations')).groupBuys[0].status,
      'Aberta',
      'cliente não encerra a campanha',
    );
    const missing = await send({ type: 'groupbuy.close', id: randomUUID() });
    assert.equal(missing.status, 404);
    await owner.command({ ...input, id: groupBuyId, endsAt: later, active: false });
    assert(!(await guest.data('catalog/products/' + product.id)).groupBuy);
    assert.equal((await guest.call('group-buys/' + groupBuyId)).status, 404);
    assert.deepEqual(await guest.data('group-buys'), []);
    // The next group-buy checks continue from this campaign: leave it active.
    await owner.command({ ...input, id: groupBuyId, endsAt: later, active: true });
    assert((await guest.data('catalog/products/' + product.id)).groupBuy);
    operationsSchema.parse(await owner.data('admin/operations'));
  });
  await check('compra coletiva segura o pedido até o grupo fechar', async () => {
    const campaign = await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: groupBuyId } }),
      line = (quantity = 1, extra = {}) => ({
        productId: product.id,
        quantity,
        color: product.colors[0],
        sizeIndex: 0,
        dedication: '',
        ...extra,
      }),
      body = async (client, email, items, extra = {}) =>
        checkout(product, await quote(client, product, items[0].quantity), email, 'card', {
          groupBuyId,
          items,
          ...extra,
        }),
      refused = async (client, email, items, code, extra) => {
        const r = await buy(client, await body(client, email, items, extra));
        assert.equal(r.status, 422, JSON.stringify(r.body));
        assert.equal(r.body.error.code, code);
      },
      send = (command) =>
        owner.call('admin/commands', 'POST', command, {
          headers: { 'idempotency-key': randomUUID() },
        }),
      kinds = async (orderId) =>
        (await ctx.db.outboxEvent.findMany({ where: { aggregateId: orderId, kind: 'email' } })).map(
          (row) => unseal(row.payloadEncrypted, ctx.config).kind,
        ),
      paid = async (client, email, quantity = 1) => {
        const r = await buy(client, await body(client, email, [line(quantity)]));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return ctx.db.order.findUniqueOrThrow({
          where: { id: r.body.data.orderId },
          include: { items: true, payment: true, job: true },
        });
      },
      buyerA = new Client(),
      buyerB = new Client(),
      a = await register(buyerA, 'grupo-a'),
      b = await register(buyerB, 'grupo-b');
    assert(product.sizes.length > 1, 'o produto de teste tem mais de um tamanho');
    await refused(
      buyerA,
      a.email,
      [line(), line(1, { dedication: 'Outra linha' })],
      'GROUP_BUY_SINGLE_ITEM',
    );
    await refused(buyerA, a.email, [line()], 'COUPON_NOT_ALLOWED', { coupon: 'X' });
    await refused(buyerA, a.email, [line(1, { sizeIndex: 1 })], 'GROUP_BUY_ITEM');
    await refused(buyerA, a.email, [line(3)], 'GROUP_BUY_LIMIT');
    assert.equal(await ctx.db.order.count({ where: { groupBuyId } }), 0);

    const first = await paid(buyerA, a.email);
    assert.equal(first.groupBuyId, groupBuyId);
    assert.equal(first.items[0].unitCents, campaign.groupPriceCents);
    assert.equal(first.subtotalCents, campaign.groupPriceCents);
    assert.equal(first.data.groupBuy.paidUnitCents, campaign.groupPriceCents);
    assert.equal(first.payment.status, 'Pago');
    assert.equal(first.status, 'Aguardando grupo');
    assert.equal(first.job, null);
    const joined = await mail(first.id, 'group-joined');
    assert(joined.envelope.text.includes(campaign.title));
    assert(!(await kinds(first.id)).includes('payment-approved'));

    const toProduction = await send({
      type: 'order.update',
      id: first.id,
      status: 'Em produção',
      priority: first.priority,
      due: first.due.toISOString(),
      notes: first.notes,
    });
    assert.equal(toProduction.status, 409, JSON.stringify(toProduction.body));
    assert.equal(toProduction.body.error.code, 'GROUP_PENDING');
    const batch = await send({ type: 'orders.batch', ids: [first.id], action: 'production' });
    assert.equal(batch.status, 409, JSON.stringify(batch.body));
    assert.equal(batch.body.error.code, 'GROUP_PENDING');
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: first.id } }), 0);
    const ship = await send({ type: 'shipping.label', id: first.id, action: 'prepare' });
    assert.equal(ship.status, 409, JSON.stringify(ship.body));
    assert.equal(ship.body.error.code, 'GROUP_PENDING');
    assert.equal(await ctx.db.shipment.count({ where: { orderId: first.id } }), 0);

    const again = await paid(buyerA, a.email);
    assert.equal(again.status, 'Aguardando grupo');
    const row = (await owner.data('admin/operations')).groupBuys.find((g) => g.id === groupBuyId);
    assert.equal(row.participants, 1, 'o mesmo cliente conta uma vez');
    assert.equal(row.status, 'Aberta');
    await refused(buyerA, a.email, [line()], 'GROUP_BUY_LIMIT');

    const closing = await paid(buyerB, b.email);
    assert.equal(closing.status, 'Confirmado');
    assert(closing.job, 'o pedido que fecha a meta vai para a produção');
    assert(!(await kinds(closing.id)).includes('group-joined'));
    await mail(closing.id, 'payment-approved');
    const reached = await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: groupBuyId } });
    assert.equal(reached.status, 'Meta atingida');
    assert(reached.goalReachedAt);
    assert.equal(
      await ctx.db.outboxEvent.count({
        where: { key: 'group-reached/' + groupBuyId, kind: 'group-buy-reached' },
      }),
      1,
    );

    const estimate = await guest.call('checkout/estimate', 'POST', {
      items: [line(2)],
      coupon: '',
      groupBuyId,
    });
    assert.equal(estimate.status, 200, JSON.stringify(estimate.body));
    assert.equal(estimate.body.data.subtotalCents, campaign.groupPriceCents * 2);

    // A payment approved after the campaign ended without the goal, on two other products.
    const adminOps = await owner.data('admin/operations'),
      [holdProduct, differenceProduct] = (await guest.data('catalog/products')).filter(
        (p) => p.id !== product.id && !p.kit && !p.kitSummary && !p.groupBuy,
      ),
      latePayment = async (p, mode, label) => {
        const current = adminOps.products.find((row) => row.id === p.id);
        await owner.command({
          type: 'groupbuy.save',
          title: 'Campanha que não fechou ' + label,
          description: '',
          productId: p.id,
          sizeIndex: 0,
          groupPriceCents: (current.sizePrices?.[0] ?? current.priceCents) - 100,
          goal: 2,
          maxParticipants: null,
          perPersonLimit: 1,
          mode,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          active: true,
        });
        const gb = await ctx.db.groupBuy.findFirstOrThrow({
            where: { productId: p.id, status: 'Aberta' },
          }),
          client = new Client(),
          email = 'grupo-' + label + '-' + runId + '@example.test',
          q = await quote(client, p),
          r = await buy(
            client,
            checkout(p, q, email, 'pix', {
              groupBuyId: gb.id,
              items: [
                { productId: p.id, quantity: 1, color: p.colors[0], sizeIndex: 0, dedication: '' },
              ],
            }),
          );
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const pending = await ctx.db.order.findUniqueOrThrow({
          where: { id: r.body.data.orderId },
          include: { payment: true },
        });
        assert.equal(pending.payment.status, 'Pendente');
        await ctx.db.groupBuy.update({
          where: { id: gb.id },
          data: { status: 'Não fechou', closedAt: new Date() },
        });
        await owner.command({ type: 'charge.pay', id: pending.payment.id });
        return ctx.db.order.findUniqueOrThrow({
          where: { id: pending.id },
          include: { payment: true, job: true },
        });
      };
    assert(holdProduct && differenceProduct, 'há dois outros produtos sem campanha');
    const failed = await latePayment(holdProduct, 'hold', 'hold');
    // The live worker may already have run the cancellation (and its refund) for this order.
    assert(['Pago', 'Estornado'].includes(failed.payment.status), failed.payment.status);
    assert(['Aguardando grupo', 'Cancelado'].includes(failed.status), failed.status);
    assert.equal(failed.job, null);
    assert.equal(
      await ctx.db.outboxEvent.count({
        where: { key: 'group-fail/' + failed.id, kind: 'group-buy-fail-order' },
      }),
      1,
    );
    const failedKinds = await kinds(failed.id);
    assert(!failedKinds.includes('group-joined'));
    assert(!failedKinds.includes('payment-approved'));
    const late = await latePayment(differenceProduct, 'difference', 'diferenca');
    assert.equal(late.status, 'Confirmado');
    assert(late.job, 'pedido pago pelo preço normal vai para a produção');
    assert.equal(late.data.groupBuy.paidUnitCents, late.data.groupBuy.normalUnitCents);
    assert.equal(await ctx.db.outboxEvent.count({ where: { key: 'group-diff/' + late.id } }), 0);
    assert.equal(await ctx.db.outboxEvent.count({ where: { key: 'group-fail/' + late.id } }), 0);
    assert((await kinds(late.id)).includes('payment-approved'));
    operationsSchema.parse(await owner.data('admin/operations'));
  });
  await check('compra coletiva libera, devolve a diferença e estorna se não fechar', async () => {
    const send = (command) =>
        owner.call('admin/commands', 'POST', command, {
          headers: { 'idempotency-key': randomUUID() },
        }),
      kinds = async (orderId) =>
        (await ctx.db.outboxEvent.findMany({ where: { aggregateId: orderId, kind: 'email' } })).map(
          (row) => unseal(row.payloadEncrypted, ctx.config).kind,
        ),
      count = async (orderId, kind) => (await kinds(orderId)).filter((k) => k === kind).length,
      // Work still queued for these aggregates (e-mails are delivered on their own queue).
      idle = async (ids) =>
        !(await ctx.db.outboxEvent.count({
          where: {
            aggregateId: { in: ids },
            kind: { not: 'email' },
            state: { in: ['pending', 'enqueued', 'processing'] },
          },
        })),
      drain = (done, message) =>
        until(async () => {
          await engine.dispatch();
          return done();
        }, message),
      load = (id) =>
        ctx.db.order.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            job: true,
            payment: { include: { parts: { include: { refunds: true } } } },
          },
        }),
      refunds = (orderId) =>
        ctx.db.refund.findMany({ where: { key: { startsWith: 'group-diff/' + orderId + '/' } } }),
      approvedSum = (rows) =>
        rows.filter((r) => r.status === 'approved').reduce((n, r) => n + r.amountCents, 0),
      adminProducts = (await owner.data('admin/operations')).products,
      normalOf = (p) => {
        const row = adminProducts.find((r) => r.id === p.id);
        return row.sizePrices?.[0] ?? row.priceCents;
      },
      campaign = async (p, fields) => {
        await owner.command({
          type: 'groupbuy.save',
          title: 'Compra coletiva ' + fields.mode + ' ' + p.id.slice(0, 6),
          description: '',
          productId: p.id,
          sizeIndex: 0,
          maxParticipants: null,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          active: true,
          ...fields,
        });
        return ctx.db.groupBuy.findFirstOrThrow({ where: { productId: p.id, status: 'Aberta' } });
      },
      order = async (
        p,
        gbId,
        label,
        payment,
        quantity = 1,
        email = 'grupo-' + label + '-' + runId + '@example.test',
      ) => {
        const client = new Client(),
          q = await quote(client, p, quantity),
          r = await buy(
            client,
            checkout(p, q, email, payment, {
              groupBuyId: gbId,
              items: [
                { productId: p.id, quantity, color: p.colors[0], sizeIndex: 0, dedication: '' },
              ],
            }),
          );
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return r.body.data.orderId;
      };

    // 1. Release: the hold campaign of the previous check reached its goal with B.
    const held = (
        await ctx.db.order.findMany({
          where: { groupBuyId, customer: { email: { startsWith: 'grupo-a-' } } },
        })
      ).map((o) => o.id),
      reachedRow = await ctx.db.outboxEvent.findUniqueOrThrow({
        where: { key: 'group-reached/' + groupBuyId },
      });
    assert.equal(held.length, 2);
    await drain(async () => {
      const rows = await Promise.all(held.map(load));
      return rows.every((o) => o.status === 'Confirmado' && o.job);
    }, 'pedidos retidos liberados');
    for (const id of held) await mail(id, 'group-confirmed');
    // Re-running the event (a retry) releases nothing twice.
    await until(
      async () =>
        (await ctx.db.outboxEvent.findUnique({ where: { id: reachedRow.id } })).state ===
        'completed',
      'meta processada',
    );
    await ctx.db.outboxEvent.update({
      where: { id: reachedRow.id },
      data: { state: 'pending', availableAt: new Date() },
    });
    await drain(
      async () =>
        (await ctx.db.outboxEvent.findUnique({ where: { id: reachedRow.id } })).state ===
        'completed',
      'meta reprocessada',
    );
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: { in: held } } }), 2);
    for (const id of held) assert.equal(await count(id, 'group-confirmed'), 1);
    // The goal event can fail for good and leave a held order behind: the deadline close of a
    // hold campaign that reached its goal sweeps the held orders once more.
    const [stuck] = held;
    await ctx.db.productionJob.deleteMany({ where: { orderId: stuck } });
    await ctx.db.order.update({ where: { id: stuck }, data: { status: 'Aguardando grupo' } });
    await ctx.db.outboxEvent.update({
      where: { id: reachedRow.id },
      data: { state: 'failed', errorCode: 'JOB_EXHAUSTED' },
    });
    await ctx.db.groupBuy.update({
      where: { id: groupBuyId },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await engine.tick();
    assert.equal(
      (await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: groupBuyId } })).status,
      'Concluída',
    );
    assert.equal(
      await ctx.db.outboxEvent.count({
        where: { key: 'group-close-release/' + groupBuyId, kind: 'group-buy-reached' },
      }),
      1,
    );
    await drain(async () => {
      const o = await load(stuck);
      return o.status === 'Confirmado' && o.job;
    }, 'pedido retido liberado no encerramento');
    assert.equal(await count(stuck, 'group-confirmed'), 1);
    assert.equal(await ctx.db.productionJob.count({ where: { orderId: { in: held } } }), 2);

    // 2. Difference: C pays the normal price, D pays split before the goal and closes it.
    const others = (await guest.data('catalog/products')).filter(
      (p) => p.id !== product.id && !p.kit && !p.kitSummary && !p.groupBuy,
    );
    assert(others.length >= 3, 'há três outros produtos sem campanha aberta');
    const [diffProduct, holdProduct, earlyProduct] = others,
      normal = normalOf(diffProduct);
    assert(normal > 3000, 'a diferença precisa passar da parte Pix do pagamento dividido');
    const diff = await campaign(diffProduct, {
        mode: 'difference',
        goal: 2,
        perPersonLimit: 2,
        groupPriceCents: normal - 2500,
      }),
      cId = await order(diffProduct, diff.id, 'c', 'card', 2),
      c = await load(cId);
    assert.equal(c.status, 'Confirmado');
    assert(c.job, 'C vai para a produção');
    assert.equal(c.items[0].unitCents, normal);
    const dId = await order(diffProduct, diff.id, 'd', 'split');
    await owner.command({ type: 'charge.pay', id: (await load(dId)).payment.id });
    const reachedDiff = await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: diff.id } });
    assert.equal(reachedDiff.status, 'Meta atingida');
    const expected = { [cId]: 2500 * 2, [dId]: 2500 };
    await drain(async () => {
      for (const id of [cId, dId])
        if (
          approvedSum(await refunds(id)) !== expected[id] ||
          !(await count(id, 'group-difference'))
        )
          return false;
      return idle([cId, dId, diff.id]);
    }, 'diferença devolvida');
    const d = await load(dId),
      dRefunds = await refunds(dId),
      pixPart = d.payment.parts.find((p) => p.method === 'pix'),
      cardPart = d.payment.parts.find((p) => p.method === 'card');
    assert.equal(dRefunds.length, 2, 'o estorno de D se divide entre Pix e cartão');
    for (const part of [pixPart, cardPart]) {
      const row = dRefunds.find((r) => r.partId === part.id);
      assert(row && row.amountCents <= part.amountCents, 'estorno até o capturado da parte');
      assert.equal(row.key, 'group-diff/' + dId + '/' + part.id);
      assert.equal(part.refundedCents, row.amountCents);
    }
    assert.equal(dRefunds.find((r) => r.partId === pixPart.id).amountCents, 2000);
    for (const id of [cId, dId]) {
      const o = await load(id);
      assert.equal(o.status, 'Confirmado');
      assert.equal(o.payment.status, 'Pago');
      const m = await mail(id, 'group-difference');
      assert(m.envelope.text.includes(diff.title));
    }
    // A second tick, dispatch or direct retry refunds and e-mails nothing more.
    const snapshot = async () =>
        JSON.stringify([
          (await refunds(cId)).length,
          (await refunds(dId)).length,
          await count(cId, 'group-difference'),
          await count(dId, 'group-difference'),
        ]),
      before = await snapshot();
    await new (await import('@maos-em-oracao/backend-core/group-buys')).GroupBuysService(
      ctx,
    ).refundDifference(dId);
    await engine.tick();
    await engine.dispatch();
    await sleep(2500);
    assert.equal(await snapshot(), before);
    assert.equal(before, JSON.stringify([1, 2, 1, 1]));
    // A retry interrupted after the Pix share but before the card was confirmed: the card share is
    // redone with the same amount and key, the Pix share is left alone and nothing is doubled.
    const cardShare = dRefunds.find((r) => r.partId === cardPart.id),
      pixShare = dRefunds.find((r) => r.partId === pixPart.id),
      parts = async () =>
        Object.fromEntries(
          (await ctx.db.paymentPart.findMany({ where: { intentId: d.payment.id } })).map((p) => [
            p.method,
            p.refundedCents,
          ]),
        );
    await ctx.db.refund.update({ where: { id: cardShare.id }, data: { status: 'pending' } });
    await ctx.db.paymentPart.update({
      where: { id: cardPart.id },
      data: { refundedCents: cardPart.refundedCents - cardShare.amountCents },
    });
    await new (await import('@maos-em-oracao/backend-core/group-buys')).GroupBuysService(
      ctx,
    ).refundDifference(dId);
    assert.deepEqual(await parts(), { pix: 2000, card: 500 });
    const retried = await refunds(dId);
    assert.equal(retried.length, 2);
    assert(retried.every((r) => r.status === 'approved'));
    assert.deepEqual(
      retried.find((r) => r.id === pixShare.id),
      pixShare,
      'a parte Pix não muda',
    );
    assert.equal(retried.find((r) => r.id === cardShare.id).amountCents, cardShare.amountCents);
    assert.equal(await count(dId, 'group-difference'), 1);
    // Asking for more than the payment still holds fails before touching anything.
    const payments = new (await import('@maos-em-oracao/backend-core/payments')).PaymentsService(
      ctx,
    );
    await assert.rejects(
      payments.refundPartial(dId, d.payment.amountCents, 'Teste', 'test-exceeds/' + dId),
      (error) => error.code === 'REFUND_EXCEEDS',
    );
    assert.equal(
      await ctx.db.refund.count({ where: { key: { startsWith: 'test-exceeds/' + dId } } }),
      0,
    );
    assert.deepEqual(await parts(), { pix: 2000, card: 500 });

    // 3. After the goal the item already costs the group price: nothing to refund.
    const eId = await order(diffProduct, diff.id, 'e', 'card'),
      e = await load(eId);
    assert.equal(e.items[0].unitCents, normal - 2500);
    assert.equal(e.status, 'Confirmado');
    await engine.dispatch();
    await sleep(1500);
    assert.equal((await refunds(eId)).length, 0);
    assert.equal(await ctx.db.outboxEvent.count({ where: { key: 'group-diff/' + eId } }), 0);

    // 4. The admin sees each refund and the campaign total.
    const adminDiff = (await owner.data('admin/operations')).groupBuys.find(
        (g) => g.id === diff.id,
      ),
      refundOf = (id) => adminDiff.orders.find((o) => o.orderId === id).refund;
    assert.equal(refundOf(cId).amountCents, 5000);
    assert.equal(refundOf(cId).status, 'approved');
    assert.equal(refundOf(dId).amountCents, 2500);
    assert.equal(refundOf(eId), null);
    assert.equal(adminDiff.refundedCents, 7500);
    assert.equal(adminDiff.locked, true);

    // 5. Deadline without the goal (hold, stock policy): paid and pending orders are cancelled.
    const opsNow = await owner.data('admin/operations'),
      policy = opsNow.workspace;
    await owner.command({
      type: 'workspace.save',
      settings: { ...policy, inventoryPolicy: 'stock' },
    });
    try {
      await owner.command({
        type: 'product.save',
        product: { ...opsNow.products.find((p) => p.id === holdProduct.id), stock: 5 },
      });
      const hold = await campaign(holdProduct, {
          mode: 'hold',
          goal: 3,
          perPersonLimit: 1,
          groupPriceCents: normalOf(holdProduct) - 100,
        }),
        stock = async () =>
          (await ctx.db.product.findUniqueOrThrow({ where: { id: holdProduct.id } })).stock,
        fId = await order(holdProduct, hold.id, 'f', 'card');
      assert.equal((await load(fId)).status, 'Aguardando grupo');
      assert.equal(await stock(), 4);
      const gId = await order(holdProduct, hold.id, 'g', 'pix');
      assert.equal((await load(gId)).payment.status, 'Pendente');
      await ctx.db.groupBuy.update({
        where: { id: hold.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
      await engine.tick();
      assert.equal(
        (await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: hold.id } })).status,
        'Não fechou',
      );
      await drain(async () => {
        const [f, g] = await Promise.all([load(fId), load(gId)]);
        return (
          f.status === 'Cancelado' &&
          f.payment.status === 'Estornado' &&
          g.status === 'Cancelado' &&
          (await stock()) === 5 &&
          (await idle([fId, gId, hold.id]))
        );
      }, 'campanha sem meta estornada');
      await mail(fId, 'group-failed');
      assert.equal(await count(gId, 'group-failed'), 0);
      assert.equal(
        await ctx.db.stockMovement.count({
          where: { productId: holdProduct.id, reason: 'Compra coletiva não fechou ' + fId },
        }),
        1,
      );
    } finally {
      await owner.command({ type: 'workspace.save', settings: policy });
    }

    // 6. A payment approved after the campaign failed is cancelled and refunded.
    const lateHold = await campaign(holdProduct, {
        mode: 'hold',
        goal: 2,
        perPersonLimit: 1,
        groupPriceCents: normalOf(holdProduct) - 100,
      }),
      hId = await order(holdProduct, lateHold.id, 'h', 'pix');
    await ctx.db.groupBuy.update({
      where: { id: lateHold.id },
      data: { status: 'Não fechou', closedAt: new Date() },
    });
    await owner.command({ type: 'charge.pay', id: (await load(hId)).payment.id });
    await drain(async () => {
      const h = await load(hId);
      return h.status === 'Cancelado' && h.payment.status === 'Estornado';
    }, 'pagamento tardio estornado');
    await mail(hId, 'group-failed');

    // 7. Closing early: the claim runs once and a difference campaign refunds nothing.
    const early = await campaign(earlyProduct, {
        mode: 'difference',
        goal: 2,
        perPersonLimit: 2,
        groupPriceCents: normalOf(earlyProduct) - 100,
      }),
      iId = await order(earlyProduct, early.id, 'i', 'card'),
      // The same person again as a guest, with the e-mail in another case: still one participant.
      jId = await order(
        earlyProduct,
        early.id,
        'j',
        'card',
        1,
        ('grupo-i-' + runId + '@example.test').toUpperCase(),
      ),
      campaignRefunds = () =>
        ctx.db.refund.count({ where: { part: { intent: { order: { groupBuyId: early.id } } } } });
    assert.equal((await load(iId)).status, 'Confirmado');
    assert.equal((await load(jId)).payment.status, 'Pago');
    assert.notEqual((await load(iId)).customerId, (await load(jId)).customerId);
    // A known cost, to tell the owner's view from a marketing-only one.
    const earlyStored = await ctx.db.product.findUniqueOrThrow({ where: { id: earlyProduct.id } });
    await ctx.db.product.update({
      where: { id: earlyProduct.id },
      data: {
        data: {
          ...earlyStored.data,
          costBySize: undefined,
          costBreakdown: {
            materialCents: 1234,
            packagingCents: 0,
            energyCents: 0,
            laborCents: 0,
            otherCents: 0,
          },
        },
      },
    });
    const earlyRow = (await owner.data('admin/operations')).groupBuys.find(
      (g) => g.id === early.id,
    );
    assert.equal(earlyRow.participants, 1, 'o mesmo e-mail conta uma pessoa');
    assert.equal(earlyRow.initials.length, 1);
    assert.equal(earlyRow.status, 'Aberta', 'a mesma pessoa não bate a meta sozinha');
    assert.equal((await guest.data('group-buys/' + early.id)).participants, 1);
    // Owner sees full e-mails and the cost; a marketing-only member sees neither.
    assert(earlyRow.orders.some((o) => o.email === 'grupo-i-' + runId + '@example.test'));
    assert.equal(earlyRow.costCents, 1234);
    const marketing = await marketingMember(owner, 'marketing');
    const scoped = operationsSchema.parse(await marketing.data('admin/operations')),
      scopedRow = scoped.groupBuys.find((g) => g.id === early.id);
    assert.equal(scopedRow.costCents, 0);
    assert(scopedRow.orders.length >= 2);
    for (const o of scopedRow.orders) assert.match(o.email, /^g\*\*\*@example\.test$/i);
    assert(
      !JSON.stringify(scoped.groupBuys)
        .toLowerCase()
        .includes('grupo-i-' + runId),
    );
    await owner.command({ type: 'groupbuy.close', id: early.id });
    const closed = await ctx.db.groupBuy.findUniqueOrThrow({ where: { id: early.id } });
    assert.equal(closed.status, 'Não fechou');
    assert(closed.closedAt && closed.endsAt.getTime() <= Date.now());
    assert.equal(
      await ctx.db.auditEntry.count({
        where: { entity: early.id, action: 'Compra coletiva encerrada' },
      }),
      1,
    );
    const twice = await send({ type: 'groupbuy.close', id: early.id });
    assert.equal(twice.status, 409, JSON.stringify(twice.body));
    assert.equal(twice.body.error.code, 'GROUP_BUY_CLOSED');
    await engine.dispatch();
    await sleep(1500);
    assert.equal(await campaignRefunds(), 0);
    assert.equal(await ctx.db.outboxEvent.count({ where: { key: 'group-fail/' + iId } }), 0);
    assert.equal((await load(iId)).status, 'Confirmado');
    operationsSchema.parse(await owner.data('admin/operations'));
  });
  await check(
    'stories: admin monta destaque, loja mostra só o pronto e conta métricas',
    async () => {
      const send = (client, command) =>
          client.call('admin/commands', 'POST', command, {
            headers: { 'idempotency-key': randomUUID() },
          }),
        upload = async (client, kind, { complete = true } = {}) => {
          const bytes =
              kind === 'image'
                ? await sharp({
                    create: { width: 8, height: 8, channels: 3, background: '#7a5c3e' },
                  })
                    .png()
                    .toBuffer()
                : Buffer.from('story-video-' + randomUUID()),
            u = await client.call('admin/media/uploads', 'POST', {
              name: kind === 'image' ? 'capa.png' : 'story.mp4',
              mime: kind === 'image' ? 'image/png' : 'video/mp4',
              size: bytes.length,
              kind,
            });
          assert.equal(u.status, 200, u.body?.error?.code);
          if (!complete) return u.body.data.id;
          const id = u.body.data.id;
          assert.equal(
            (
              await client.call('admin/media/uploads/' + id + '/content', 'PUT', undefined, {
                bytes,
              })
            ).status,
            204,
          );
          const done = await client.call('admin/media/uploads/' + id + '/complete', 'POST', {});
          assert.equal(done.status, 200, done.body?.error?.code);
          assert.equal(done.body.data.status, 'ready');
          return id;
        },
        stories = async () => (await guest.data('stories')).collections,
        admin = async () => (await owner.data('admin/operations')).stories,
        template = (await owner.data('admin/operations')).products.find((p) => p.id === product.id),
        [p1, p2, p3, p4] = [1, 2, 3, 4].map((n) => {
          const p = {
            ...template,
            id: randomUUID(),
            sku: 'STORY-' + n + '-' + runId,
            name: 'Peça do story ' + n,
            active: true,
            archived: false,
            stock: 5,
          };
          delete p.kit;
          return p;
        });
      for (const p of [p1, p2, p3, p4]) await owner.command({ type: 'product.save', product: p });
      const coverId = await upload(owner, 'image'),
        videoId = await upload(owner, 'video'),
        coverUrl = (await ctx.db.mediaAsset.findUniqueOrThrow({ where: { id: coverId } })).data.url,
        highlight = {
          type: 'story.save',
          title: 'Terços',
          coverAssetId: coverId,
          active: true,
          placements: ['home_top'],
          categories: [],
        };
      // 1-2. Category placement needs a category; the cover must be a ready image.
      const noCategory = await send(owner, { ...highlight, placements: ['category'] });
      assert.equal(noCategory.status, 422);
      assert.equal(noCategory.body.error.code, 'CATEGORY_REQUIRED');
      const videoCover = await send(owner, { ...highlight, coverAssetId: videoId });
      assert.equal(videoCover.status, 422);
      assert.equal(videoCover.body.error.code, 'INVALID_COVER');
      // 3. A highlight without videos is kept in the admin and hidden in the store.
      await owner.command(highlight);
      let list = await admin();
      assert.equal(list.length, 1);
      const highlightId = list[0].id;
      assert.deepEqual(list[0].videos, []);
      assert.equal(list[0].coverUrl, coverUrl);
      assert.deepEqual(await stories(), []);
      // 4. The video must be a video; at most 3 products.
      const video = {
        type: 'story.video.save',
        highlightId,
        assetId: videoId,
        caption: 'Terço de madeira feito à mão',
        productIds: [p1.id],
        active: true,
      };
      const imageVideo = await send(owner, { ...video, assetId: coverId });
      assert.equal(imageVideo.status, 422);
      assert.equal(imageVideo.body.error.code, 'INVALID_VIDEO');
      const tooMany = await send(owner, { ...video, productIds: [p1.id, p2.id, p3.id, p4.id] });
      assert(tooMany.status >= 400 && tooMany.status < 500, String(tooMany.status));
      // 5. A ready video shows up with the public product projection only.
      await owner.command(video);
      let pub = await stories();
      assert.equal(pub.length, 1);
      assert.equal(pub[0].id, highlightId);
      assert.equal(pub[0].coverUrl, coverUrl);
      assert.deepEqual(pub[0].placements, ['home_top']);
      assert.equal(pub[0].format, 'stories');
      assert.equal(list[0].format, 'stories');
      assert.equal(pub[0].videos.length, 1);
      const storyVideoId = pub[0].videos[0].id;
      assert.equal(pub[0].videos[0].caption, video.caption);
      assert.deepEqual(pub[0].videos[0].source, {
        type: 'file',
        src: '/api/media/public/' + videoId + '/video',
      });
      const shown = await guest.data('catalog/products/' + p1.id);
      assert.deepEqual(pub[0].videos[0].products, [
        { id: p1.id, name: shown.name, priceCents: shown.priceCents, image: shown.image },
      ]);
      assert(
        !/costCents|assetId|uploaderId|"views"|"clicks"/.test(JSON.stringify(pub)),
        'payload público sem custo, asset nem métricas',
      );
      // 6. A video still processing hides the whole highlight (no empty bubble).
      await ctx.db.mediaAsset.update({ where: { id: videoId }, data: { state: 'processing' } });
      assert.deepEqual(await stories(), []);
      assert.equal((await admin())[0].videos[0].status, 'processing');
      await ctx.db.mediaAsset.update({ where: { id: videoId }, data: { state: 'ready' } });
      // 7. A video sells: without stock or with only archived products it leaves the store, and a
      // collection left without videos leaves with it.
      await ctx.db.product.update({ where: { id: p1.id }, data: { stock: 0 } });
      assert.deepEqual(await stories(), []);
      await ctx.db.product.update({ where: { id: p1.id }, data: { stock: 5 } });
      assert.equal((await stories()).length, 1);
      await owner.command({ type: 'product.archive', id: p1.id });
      assert.deepEqual(await stories(), []);
      // The archived product stays linked; only the sellable one is shown.
      await owner.command({ ...video, id: storyVideoId, productIds: [p1.id, p2.id] });
      pub = await stories();
      assert.equal(pub[0].videos.length, 1);
      assert.deepEqual(
        pub[0].videos[0].products.map((p) => p.id),
        [p2.id],
      );
      // 8. Legacy view/click, new single events and batches; unknown ids are a silent no-op;
      // other event types and oversized batches are refused.
      const event = (body) => guest.call('stories/events', 'POST', body);
      for (const type of ['view', 'view', 'click'])
        assert.equal((await event({ videoId: storyVideoId, type })).status, 204);
      assert.equal((await event({ videoId: randomUUID(), type: 'view' })).status, 204);
      assert.equal((await event({ videoId: 'nao-e-uuid', type: 'click' })).status, 204);
      assert.equal((await event({ videoId: storyVideoId, type: 'impression' })).status, 204);
      const batch = await event({
        events: [
          ...['impression', 'play', 'complete', 'product_click', 'add_to_cart', 'add_to_cart'].map(
            (type) => ({ videoId: storyVideoId, type }),
          ),
          { videoId: randomUUID(), type: 'play' },
          { videoId: 'nao-e-uuid', type: 'play' },
        ],
      });
      assert.equal(batch.status, 204, batch.body?.error?.code);
      for (const body of [
        { videoId: storyVideoId, type: 'like' },
        { events: [] },
        { events: [{ videoId: storyVideoId, type: 'like' }] },
        {
          events: Array.from({ length: 51 }, () => ({ videoId: storyVideoId, type: 'play' })),
        },
      ]) {
        const refused = await event(body);
        assert(refused.status >= 400 && refused.status < 500, String(refused.status));
      }
      list = await admin();
      assert.deepEqual(
        (({ impressions, views, completes, clicks, carts }) => ({
          impressions,
          views,
          completes,
          clicks,
          carts,
        }))(list[0].videos[0]),
        { impressions: 2, views: 3, completes: 1, clicks: 2, carts: 2 },
      );
      // A video whose Stream URLs cannot be built (here: Stream not configured) leaves only itself.
      const streamId = await upload(owner, 'video');
      await owner.command({
        ...video,
        assetId: streamId,
        caption: 'Do Stream',
        productIds: [p2.id],
      });
      assert.equal((await stories())[0].videos.length, 2);
      await ctx.db.mediaAsset.update({
        where: { id: streamId },
        data: { storage: 'bunny-stream', providerId: randomUUID() },
      });
      pub = await stories();
      assert.deepEqual(
        pub[0].videos.map((v) => v.id),
        [storyVideoId],
      );
      await owner.command({
        type: 'story.video.delete',
        id: (await admin())[0].videos.find((v) => v.assetId === streamId).id,
      });
      assert.equal((await admin())[0].videos.length, 1);
      // 9. Reorder needs every highlight, then follows the new order.
      await owner.command({ ...highlight, title: 'Medalhas' });
      list = await admin();
      assert.deepEqual(
        list.map((h) => h.title),
        ['Terços', 'Medalhas'],
      );
      const secondId = list[1].id;
      const partial = await send(owner, { type: 'story.reorder', ids: [secondId] });
      assert.equal(partial.status, 422);
      assert.equal(partial.body.error.code, 'INVALID_ORDER');
      await owner.command({ type: 'story.reorder', ids: [secondId, highlightId] });
      assert.deepEqual(
        (await admin()).map((h) => h.id),
        [secondId, highlightId],
      );
      // 10. Marketing alone uploads images and videos (not models) and edits stories.
      const marketing = await marketingMember(owner, 'stories-marketing');
      await upload(marketing, 'video', { complete: false });
      const model = await marketing.call('admin/media/uploads', 'POST', {
        name: 'modelo.stl',
        mime: 'application/octet-stream',
        size: 100,
        kind: 'model',
      });
      assert.equal(model.status, 403);
      assert.equal(model.body.error.code, 'FORBIDDEN');
      const marketingCover = await upload(marketing, 'image');
      const ownStatus = await marketing.call('admin/media/' + marketingCover + '/status');
      assert.equal(ownStatus.status, 200, ownStatus.body?.error?.code);
      assert.equal(ownStatus.body.data.status, 'ready');
      const ownerModel = await owner.call('admin/media/uploads', 'POST', {
        name: 'modelo.stl',
        mime: 'application/octet-stream',
        size: 100,
        kind: 'model',
      });
      assert.equal(ownerModel.status, 200, ownerModel.body?.error?.code);
      const modelStatus = await marketing.call(
        'admin/media/' + ownerModel.body.data.id + '/status',
      );
      assert.equal(modelStatus.status, 403);
      assert.equal(modelStatus.body.error.code, 'FORBIDDEN');
      assert.equal(
        (await owner.call('admin/media/' + ownerModel.body.data.id + '/status')).status,
        200,
      );
      const byMarketing = await send(marketing, {
        ...highlight,
        title: 'Do marketing',
        coverAssetId: marketingCover,
      });
      assert.equal(byMarketing.status, 204, byMarketing.body?.error?.code);
      assert.equal(
        operationsSchema.parse(await marketing.data('admin/operations')).stories.length,
        3,
      );
      const denied = await send(customer, { type: 'story.delete', id: highlightId });
      assert.equal(denied.status, 403);
      // 10b. Marketing-only snapshot lists products, without cost.
      const scopedProducts = operationsSchema.parse(
        await marketing.data('admin/operations'),
      ).products;
      assert(
        scopedProducts.some((p) => p.id === product.id),
        'marketing sees the product list',
      );
      assert(
        scopedProducts.every((p) => p.costCents === 0),
        'marketing sees no cost',
      );
      // 10c. A linked product archived later (p1, step 7) does not block editing the video.
      const linked = await ctx.db.storyVideo.findUniqueOrThrow({ where: { id: storyVideoId } });
      assert.deepEqual(linked.productIds, [p1.id, p2.id]);
      const recaption = await send(owner, {
        ...video,
        id: linked.id,
        caption: 'Legenda nova',
        productIds: [p1.id, p2.id],
      });
      assert.equal(recaption.status, 204, recaption.body?.error?.code);
      const edited = await ctx.db.storyVideo.findUniqueOrThrow({ where: { id: linked.id } });
      assert.equal(edited.caption, 'Legenda nova');
      assert.deepEqual(edited.productIds, [p1.id, p2.id]);
      await owner.command({ type: 'product.archive', id: p3.id });
      const addArchived = await send(owner, {
        ...video,
        id: linked.id,
        productIds: [p1.id, p2.id, p3.id],
      });
      assert.equal(addArchived.status, 422);
      assert.equal(addArchived.body.error.code, 'INVALID_PRODUCT');
      // 11. Deleting a highlight removes its videos.
      await owner.command({ type: 'story.delete', id: highlightId });
      assert(!(await stories()).some((h) => h.id === highlightId));
      assert.equal(await ctx.db.storyVideo.count({ where: { highlightId } }), 0);
      const missing = await send(owner, { type: 'story.delete', id: highlightId });
      assert.equal(missing.status, 404);
      // 12. The admin snapshot keeps its contract.
      operationsSchema.parse(await owner.data('admin/operations'));
    },
  );
  await check(
    'stories: carrossel por lugar, vídeos da página do produto, configuração e vendas por vídeo',
    async () => {
      // A marketing member runs it: its own request budget, and the permission stories need.
      const team = await marketingMember(owner, 'video-commerce');
      const send = (client, command) =>
          client.call('admin/commands', 'POST', command, {
            headers: { 'idempotency-key': randomUUID() },
          }),
        upload = async (kind) => {
          const bytes =
              kind === 'image'
                ? await sharp({
                    create: { width: 8, height: 8, channels: 3, background: '#3e5c7a' },
                  })
                    .png()
                    .toBuffer()
                : Buffer.from('commerce-video-' + randomUUID()),
            u = await team.call('admin/media/uploads', 'POST', {
              name: kind === 'image' ? 'capa.png' : 'video.mp4',
              mime: kind === 'image' ? 'image/png' : 'video/mp4',
              size: bytes.length,
              kind,
            });
          assert.equal(u.status, 200, u.body?.error?.code);
          const id = u.body.data.id;
          await team.call('admin/media/uploads/' + id + '/content', 'PUT', undefined, { bytes });
          const done = await team.call('admin/media/uploads/' + id + '/complete', 'POST', {});
          assert.equal(done.body.data.status, 'ready');
          return id;
        },
        feed = () => guest.data('stories'),
        snapshot = () => team.data('admin/operations'),
        template = (await owner.data('admin/operations')).products.find((p) => p.id === product.id),
        [pa, pb, pc] = [
          ['A', 40],
          ['B', 40],
          ['C', 0],
        ].map(([n, stock]) => {
          const p = {
            ...template,
            id: randomUUID(),
            sku: 'VC-' + n + '-' + runId,
            name: 'Peça em vídeo ' + n,
            active: true,
            archived: false,
            stock,
          };
          delete p.kit;
          return p;
        });
      for (const p of [pa, pb, pc]) await owner.command({ type: 'product.save', product: p });
      const coverId = await upload('image'),
        collection = async (fields) => {
          const title = 'Vídeos ' + randomUUID().slice(0, 8);
          await team.command({
            type: 'story.save',
            title,
            coverAssetId: coverId,
            active: true,
            categories: [],
            ...fields,
          });
          return (await ctx.db.storyHighlight.findFirstOrThrow({ where: { title } })).id;
        },
        clip = async (highlightId, productIds) => {
          const caption = 'Clipe ' + randomUUID().slice(0, 8);
          await team.command({
            type: 'story.video.save',
            highlightId,
            assetId: await upload('video'),
            caption,
            productIds,
            active: true,
          });
          return (await ctx.db.storyVideo.findFirstOrThrow({ where: { highlightId, caption } })).id;
        };
      // A carousel in two places, a collection drawn nowhere and an inactive one.
      const carousel = await collection({
          format: 'carousel',
          placements: ['category', 'home_middle'],
          categories: ['Presentes'],
        }),
        hidden = await collection({ placements: [] }),
        off = await collection({ placements: ['home_bottom'], active: false }),
        v1 = await clip(carousel, [pa.id]),
        v2 = await clip(hidden, [pa.id, pb.id]),
        v3 = await clip(off, [pb.id]),
        v4 = await clip(carousel, [pc.id]),
        mine = new Set([v1, v2, v3, v4]);
      let pub = await feed();
      assert.equal(storiesFeedSchema.safeParse(pub).success, true);
      const shown = pub.collections.find((h) => h.id === carousel);
      assert.equal(shown.format, 'carousel');
      assert.deepEqual(shown.placements, ['home_middle', 'category']);
      assert.deepEqual(shown.categories, ['Presentes']);
      // The video of the product without stock is out.
      assert.deepEqual(
        shown.videos.map((v) => v.id),
        [v1],
      );
      assert(!pub.collections.some((h) => h.id === hidden || h.id === off));
      // Product page: every sellable video of any collection, newest first.
      assert.equal(pub.productPage.enabled, true);
      assert.equal(pub.productPage.position, 'right');
      assert.deepEqual(
        pub.productPage.videos.filter((v) => mine.has(v.id)).map((v) => v.id),
        [v3, v2, v1],
      );
      assert.deepEqual(pub.productPage.byProduct[pa.id], [v2, v1]);
      assert.deepEqual(pub.productPage.byProduct[pb.id], [v3, v2]);
      assert.equal(pub.productPage.byProduct[pc.id], undefined);
      // The store setting turns the product page bubble off and moves it.
      const invalid = await send(team, {
        type: 'story.settings',
        productPage: { enabled: true, position: 'top' },
      });
      assert(invalid.status >= 400 && invalid.status < 500, String(invalid.status));
      const denied = await send(customer, {
        type: 'story.settings',
        productPage: { enabled: false, position: 'left' },
      });
      assert.equal(denied.status, 403);
      assert.deepEqual((await snapshot()).storySettings, {
        productPage: { enabled: true, position: 'right' },
      });
      await team.command({
        type: 'story.settings',
        productPage: { enabled: false, position: 'left' },
      });
      assert.deepEqual(operationsSchema.parse(await snapshot()).storySettings, {
        productPage: { enabled: false, position: 'left' },
      });
      pub = await feed();
      assert.deepEqual(pub.productPage, {
        enabled: false,
        position: 'left',
        videos: [],
        byProduct: {},
      });
      assert(pub.collections.some((h) => h.id === carousel));
      await team.command({
        type: 'story.settings',
        productPage: { enabled: true, position: 'left' },
      });
      pub = await feed();
      assert.equal(pub.productPage.position, 'left');
      assert.deepEqual(pub.productPage.byProduct[pa.id], [v2, v1]);
      // A purchase from a video is attributed to it; it counts once the order is paid.
      const email = 'video-' + runId + '@example.test',
        item = (videoId) => ({
          productId: pa.id,
          quantity: 2,
          color: pa.colors[0],
          sizeIndex: 0,
          dedication: '',
          ...(videoId ? { videoId } : {}),
        }),
        order = async (videoId) => {
          const buyer = new Client(),
            r = await buy(
              buyer,
              checkout(pa, await quote(buyer, pa, 2), email, 'pix', { items: [item(videoId)] }),
            );
          assert.equal(r.status, 200, r.body?.error?.code);
          return ctx.db.orderItem.findFirstOrThrow({ where: { orderId: r.body.data.orderId } });
        },
        metrics = async () => {
          const v = (await snapshot()).stories
            .find((h) => h.id === carousel)
            .videos.find((x) => x.id === v1);
          return { orders: v.orders, revenueCents: v.revenueCents };
        },
        bought = await order(v1);
      assert.equal(bought.storyVideoId, v1);
      assert.deepEqual(await metrics(), { orders: 0, revenueCents: 0 });
      const paid = (status) =>
        ctx.db.order.update({ where: { id: bought.orderId }, data: { status } });
      await paid('Confirmado');
      assert.deepEqual(await metrics(), { orders: 1, revenueCents: bought.unitCents * 2 });
      await paid('Aguardando grupo');
      assert.deepEqual(await metrics(), { orders: 0, revenueCents: 0 });
      await paid('Cancelado');
      assert.deepEqual(await metrics(), { orders: 0, revenueCents: 0 });
      await paid('Enviado');
      assert.deepEqual(await metrics(), { orders: 1, revenueCents: bought.unitCents * 2 });
      // An unknown or malformed video id never blocks the checkout and is not stored.
      for (const videoId of [randomUUID(), 'nao-e-uuid'])
        assert.equal((await order(videoId)).storyVideoId, null);
      // Only an active video that shows the bought product is credited.
      const v2Row = await ctx.db.storyVideo.findUniqueOrThrow({ where: { id: v2 } });
      assert(v2Row.active && v2Row.productIds.includes(pa.id));
      try {
        await ctx.db.storyVideo.update({ where: { id: v2 }, data: { active: false } });
        assert.equal((await order(v2)).storyVideoId, null, 'vídeo inativo');
        await ctx.db.storyVideo.update({
          where: { id: v2 },
          data: { active: true, productIds: v2Row.productIds.filter((id) => id !== pa.id) },
        });
        assert.equal((await order(v2)).storyVideoId, null, 'produto fora do vídeo');
      } finally {
        await ctx.db.storyVideo.update({
          where: { id: v2 },
          data: { active: v2Row.active, productIds: v2Row.productIds },
        });
      }
      // Deleting the video keeps the order and its attribution column.
      await team.command({ type: 'story.video.delete', id: v1 });
      assert.equal(
        (await ctx.db.orderItem.findUniqueOrThrow({ where: { id: bought.id } })).storyVideoId,
        v1,
      );
      // Legacy placements: the migration maps `home` to the top slot and drops `product`; read
      // paths normalize rows written before it (a carousel `home` is the middle slot).
      const legacy = await ctx.db.storyHighlight.create({
          data: { title: 'Legado', coverAssetId: coverId, placements: ['home', 'product'] },
        }),
        legacyCarousel = await ctx.db.storyHighlight.create({
          data: {
            title: 'Legado carrossel',
            coverAssetId: coverId,
            format: 'carousel',
            placements: ['product', 'home'],
          },
        }),
        placementsOf = async (id) => (await snapshot()).stories.find((h) => h.id === id).placements;
      assert.deepEqual(await placementsOf(legacy.id), ['home_top']);
      assert.deepEqual(await placementsOf(legacyCarousel.id), ['home_middle']);
      const migration = await readFile(
          new URL(
            '../packages/database/prisma/migrations/202611180001_video_commerce/migration.sql',
            import.meta.url,
          ),
          'utf8',
        ),
        dataStep = migration.slice(migration.indexOf('UPDATE "StoryHighlight"'));
      await ctx.db.$executeRawUnsafe(dataStep);
      assert.deepEqual(
        (await ctx.db.storyHighlight.findUniqueOrThrow({ where: { id: legacy.id } })).placements,
        ['home_top'],
      );
      for (const id of [legacy.id, legacyCarousel.id, carousel, hidden, off])
        await team.command({ type: 'story.delete', id });
      operationsSchema.parse(await snapshot());
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
  await check('limite por cliente usa o IP do gateway, não o cookie descartável', async () => {
    const ticket = (i) => ({
      subject: 'Limite por IP ' + i,
      category: 'Outros',
      message: 'Mensagem de teste do limite por IP.',
      name: 'Visitante limite',
      email: `limite-${runId}-${i}@example.test`,
    });
    const from = (ip, extra = {}) => ({ headers: { 'x-meo-client-ip': ip, ...extra } });
    // Each call is a brand-new client without cookies, as a script dropping them would be.
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await new Client().call('support/tickets', 'POST', ticket(i), from('198.51.100.77')))
          .status,
        204,
      );
    const blocked = await new Client().call(
      'support/tickets',
      'POST',
      ticket(10),
      from('198.51.100.77', { 'x-forwarded-for': '203.0.113.' + runId.length }),
    );
    assert.equal(
      blocked.status,
      429,
      'cookie novo ou X-Forwarded-For forjado não podem zerar o limite',
    );
    assert.equal(
      (await new Client().call('support/tickets', 'POST', ticket(11), from('198.51.100.78')))
        .status,
      204,
    );
  });
  const fromIp = (ip) => ({ headers: { 'x-meo-client-ip': ip } });
  await check('frete e tentativas de cupom têm limite por cliente', async () => {
    const p = (await new Client().data('catalog/products'))[0],
      body = { cep: '01001-000', items: [{ productId: p.id, quantity: 1, sizeIndex: 0 }] };
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await new Client().call('shipping/quotes', 'POST', body, fromIp('198.51.100.91'))).status,
        200,
        'cotação ' + i,
      );
    // GET is not covered by the global limiter, so it must hit the quote limit too.
    const blocked = await new Client().call(
      'shipping/quotes?cep=01001-000&productId=' + p.id,
      'GET',
      undefined,
      fromIp('198.51.100.91'),
    );
    assert.equal(blocked.status, 429);
    assert.equal(
      (await new Client().call('shipping/quotes', 'POST', body, fromIp('198.51.100.92'))).status,
      200,
    );
    const item = { productId: p.id, quantity: 1, color: p.colors[0], sizeIndex: 0, dedication: '' },
      estimate = (coupon) =>
        new Client().call(
          'checkout/estimate',
          'POST',
          { items: [item], coupon },
          fromIp('198.51.100.93'),
        );
    for (let i = 0; i < 20; i++)
      assert.equal((await estimate('NAOEXISTE' + i)).status, 422, 'cupom ' + i);
    assert.equal((await estimate('NAOEXISTE')).status, 429);
    // Estimates without a coupon are neither counted nor blocked.
    assert.equal((await estimate('')).status, 200);
  });
  await check('links de token validam antes do Argon2 e têm limite por cliente', async () => {
    const visitor = new Client(),
      reg = await register(visitor, 'token-limite'),
      verify = await mail(reg.user.id, 'verify-email'),
      token = new URL(
        verify.envelope.text.match(/https?:[^\s]+\/conta\/confirmar[^\s]+/)[0],
      ).searchParams.get('token'),
      before = await ctx.db.user.findUniqueOrThrow({ where: { id: reg.user.id } });
    // A token of another purpose is refused and neither consumed nor turned into a password.
    const wrong = await visitor.call('auth/reset', 'POST', {
      token,
      password: 'SenhaAtaqueHomologacao!2026',
    });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.error.code, 'INVALID_TOKEN');
    assert.equal(
      (await ctx.db.user.findUniqueOrThrow({ where: { id: reg.user.id } })).passwordHash,
      before.passwordHash,
    );
    assert.equal((await visitor.call('auth/verify', 'POST', { token })).status, 204);
    // One budget per client for every link-consuming endpoint, whatever cookie it sends.
    const bogus = () => randomBytes(24).toString('hex');
    for (let i = 0; i < 20; i++)
      assert.equal(
        (
          await new Client().call(
            'auth/reset',
            'POST',
            { token: bogus(), password: 'SenhaQualquerHomologacao!2026' },
            fromIp('198.51.100.94'),
          )
        ).status,
        404,
        'token ' + i,
      );
    for (const [path, payload] of [
      ['auth/verify', { token: bogus() }],
      ['auth/email-change', { token: bogus() }],
      ['auth/guest-order', { token: bogus() }],
      [
        'team/invitations/' + bogus() + '/accept',
        { name: 'Ataque', password: 'SenhaQualquerHomologacao!2026' },
      ],
    ])
      assert.equal(
        (await new Client().call(path, 'POST', payload, fromIp('198.51.100.94'))).status,
        429,
        path,
      );
    assert.equal(
      (await new Client().call('auth/verify', 'POST', { token: bogus() }, fromIp('198.51.100.95')))
        .status,
      404,
    );
  });
  await check('troca de e-mail tem limite por conta e só o último link vale', async () => {
    const client = new Client(),
      reg = await register(client, 'troca-email'),
      change = (i) =>
        client.call('account/profile', 'PATCH', {
          name: 'Cliente troca',
          email: `novo-${i}-${runId}@example.test`,
        });
    for (let i = 0; i < 3; i++) assert.equal((await change(i)).status, 204, 'troca ' + i);
    assert.equal((await change(3)).status, 429);
    const open = await ctx.db.emailToken.findMany({
      where: { userId: reg.user.id, purpose: 'email-change', usedAt: null },
    });
    assert.equal(open.length, 1);
    assert.equal(open[0].data.email, `novo-2-${runId}@example.test`);
    // Keeping the same e-mail is not a change and is not limited.
    assert.equal(
      (
        await client.call('account/profile', 'PATCH', {
          name: 'Cliente troca nome',
          email: reg.email,
        })
      ).status,
      204,
    );
  });
  await check('cupom volta uma única vez quando o pagamento não acontece', async () => {
    const p = (await new Client().data('catalog/products'))[0],
      code = 'VOLTA' + runId.toUpperCase();
    await owner.command({
      type: 'coupon.save',
      coupon: {
        id: randomUUID(),
        code,
        active: true,
        limit: 10,
        used: 0,
        kind: 'fixed',
        amount: 500,
        minimumCents: 0,
        startsAt: '2020-01-01',
        endsAt: '2099-12-31',
      },
    });
    // Other orders already took 3 uses: a double release would show as 2.
    await ctx.db.coupon.update({ where: { code }, data: { used: 3 } });
    const used = async () => (await ctx.db.coupon.findUniqueOrThrow({ where: { code } })).used,
      buyer = new Client(),
      r = await buy(
        buyer,
        checkout(p, await quote(buyer, p), 'cupom-' + runId + '@example.test', 'pix', {
          coupon: code,
        }),
      );
    assert.equal(r.status, 200, r.body?.error?.code);
    const id = r.body.data.orderId,
      intent = await ctx.db.paymentIntent.findUniqueOrThrow({ where: { orderId: id } }),
      service = new (await import('@maos-em-oracao/backend-core/payments')).PaymentsService(ctx);
    assert.equal(await used(), 4);
    await service.cancelPending(intent.id);
    assert.equal(await used(), 3);
    await service.cancelPending(intent.id);
    assert.equal(await used(), 3, 'expiração repetida não devolve de novo');
    // A renewed Pix keeps the discount, so it takes the use again.
    const retry = await buyer.call(
      'orders/' + id + '/payment',
      'POST',
      {},
      { headers: { 'idempotency-key': randomUUID() } },
    );
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(await used(), 4);
    await service.cancelPending(intent.id);
    assert.equal(await used(), 3);
    await owner.command({ type: 'orders.batch', ids: [id], action: 'cancel' });
    assert.equal((await ctx.db.order.findUniqueOrThrow({ where: { id } })).status, 'Cancelado');
    assert.equal(await used(), 3, 'cancelamento pela loja não devolve de novo');
    const order = (await owner.data('admin/operations')).orders.find((o) => o.id === id);
    assert.equal(order.couponReleased, undefined);
  });
  await check('denúncia não devolve à análise uma oração oculta', async () => {
    const author = new Client(),
      title = 'Oração denúncia ' + runId;
    assert.equal(
      (
        await author.call('community/prayers', 'POST', {
          name: 'Autora',
          title,
          message: 'Pedido de oração fictício para o teste de denúncia.',
          category: 'Família',
          anonymous: false,
          consent: true,
        })
      ).status,
      204,
    );
    const p = (await owner.data('admin/operations')).prayers.find((v) => v.title === title),
      review = (status) =>
        owner.command({ type: 'prayer.review', id: p.id, status, note: 'Teste de denúncia.' }),
      report = () =>
        new Client().call('community/prayers/' + p.id + '/report', 'POST', {
          reason: 'Conteúdo inadequado para o teste.',
        });
    await review('Publicado');
    assert.equal((await report()).status, 204);
    await review('Oculto');
    for (let i = 0; i < 3; i++) {
      const r = await report();
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'PRAYER_NOT_PUBLISHED');
    }
    assert.equal(
      (await ctx.db.prayer.findUniqueOrThrow({ where: { id: p.id } })).moderation,
      'Oculto',
    );
  });
  await check('perfil sem clientes não recebe CPF nem telefone; auditoria só do dono', async () => {
    const email = 'atendimento-' + runId + '@example.test',
      password = 'EquipeHomologacao!2026',
      member = new Client();
    await owner.command({
      type: 'invite.create',
      name: 'Atendimento teste',
      email,
      role: 'production',
      permissions: ['support', 'reports'],
    });
    const invite = (await owner.data('admin/operations')).invitations.find(
      (i) => i.email === email,
    );
    assert.equal(
      (
        await member.call('team/invitations/' + invite.token + '/accept', 'POST', {
          name: 'Atendimento teste',
          password,
        })
      ).status,
      204,
    );
    assert.equal(
      (await member.call('auth/login', 'POST', { email, password, kind: 'staff' })).status,
      200,
    );
    // A guest order stores the full delivery address, document included, on the customer.
    const p = (await new Client().data('catalog/products'))[0],
      buyerEmail = 'cpf-' + runId + '@example.test',
      buyer = new Client(),
      input = checkout(p, await quote(buyer, p), buyerEmail);
    input.address = { ...input.address, document: '52998224725' };
    const r = await buy(buyer, input);
    assert.equal(r.status, 200, r.body?.error?.code);
    const id = r.body.data.orderId,
      full = await owner.data('admin/operations');
    assert.equal(full.clients.find((c) => c.email === buyerEmail).document, '52998224725');
    assert.equal(full.orders.find((o) => o.id === id).address.document, '52998224725');
    const limited = operationsSchema.parse(await member.data('admin/operations')),
      client = limited.clients.find((c) => c.email === buyerEmail);
    assert(client, 'cliente nomeado para o atendimento');
    assert.equal(client.document, undefined);
    assert.equal(client.phone, '');
    assert.equal(client.street, '');
    const order = limited.orders.find((o) => o.id === id);
    assert.equal(order.address.document, undefined);
    assert.equal(order.address.phone, '11999990000');
    assert(!JSON.stringify(limited).includes('52998224725'));
    for (const prefix of ['admin/reports/', 'admin/resources/'])
      assert.equal((await member.call(prefix + 'audit')).status, 403, prefix);
    assert.equal((await member.call('admin/reports/support?limit=2')).status, 200);
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
    // Legacy IPN and unused topics are acknowledged (no retries) but never stored or acted on.
    const before = await ctx.db.webhookInbox.count({ where: { provider: 'mercado-pago' } });
    for (const [query, payload] of [
      ['?topic=payment&id=123456789', { resource: '123456789', topic: 'payment' }],
      ['?data.id=987&type=merchant_order', { type: 'merchant_order', data: { id: '987' } }],
    ]) {
      const response = await fetch(base + '/webhooks/mercado-pago' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ignored, true);
    }
    assert.equal(await ctx.db.webhookInbox.count({ where: { provider: 'mercado-pago' } }), before);
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
  // ------------------------------------------------------------------ CRM de e-mail
  const crmSend = (client, command) =>
      client.call('admin/commands', 'POST', command, {
        headers: { 'idempotency-key': randomUUID() },
      }),
    crmEmail = (label) => 'crm-' + label + '-' + runId + '@example.test',
    crmContact = (email) => ctx.db.marketingContact.findUnique({ where: { email } }),
    crmTemplate = (await owner.data('admin/operations')).products.find((p) => p.id === product.id),
    crmProduct = { ...crmTemplate, id: randomUUID(), sku: 'CRM-' + runId, name: 'Peça do CRM' };
  delete crmProduct.kit;
  Object.assign(crmProduct, { active: true, archived: false, stock: 80 });
  await owner.command({ type: 'product.save', product: crmProduct });
  /** A real checkout of the CRM product, then forced to a purchase status/total/date. */
  const crmBuy = async (
      email,
      { status = 'Confirmado', cents, days, marketingOptIn, item = crmProduct } = {},
    ) => {
      const buyer = new Client(),
        q = await quote(buyer, item),
        r = await buy(buyer, {
          ...checkout(item, q, email),
          ...(marketingOptIn ? { marketingOptIn } : {}),
        });
      assert.equal(r.status, 200, r.body?.error?.code);
      await ctx.db.order.update({
        where: { id: r.body.data.orderId },
        data: {
          status,
          ...(cents
            ? { totalCents: cents, subtotalCents: cents, shippingCents: 0, discountCents: 0 }
            : {}),
          ...(days ? { createdAt: new Date(Date.now() - days * 86400000) } : {}),
        },
      });
      return r.body.data.orderId;
    },
    crmPreview = async (rules, client = owner) => {
      const r = await client.call('admin/crm/preview', 'POST', { segment: { rules } });
      assert.equal(r.status, 200, r.body?.error?.code);
      return r.body.data;
    },
    crmSettings = async (patch) => {
      const current = (await owner.data('admin/operations')).crm.settings;
      await owner.command({ type: 'crm.settings', settings: { ...current, ...patch } });
    },
    crmBought = { type: 'product', productId: crmProduct.id };
  const crmRegistered = crmEmail('cadastro'),
    crmGuest = 'CRM-Checkout-' + runId + '@Example.test',
    crmAccount = new Client();
  await check('CRM: aceite no cadastro, no checkout e na conta', async () => {
    const r = await crmAccount.call('auth/login', 'POST', {
      name: 'Cliente do CRM',
      email: crmRegistered,
      password: 'IntegrationTeste!2026',
      kind: 'customer',
      register: true,
      marketingOptIn: true,
    });
    assert.equal(r.status, 200, r.body?.error?.code);
    const registered = await crmContact(crmRegistered);
    assert.equal(registered.legalBasis, 'consent');
    assert.equal(registered.consentSource, 'register');
    assert.equal(registered.consentVersion, '2026-11-14');
    assert(registered.consentAt);
    assert.equal(registered.name, 'Cliente do CRM');
    const plain = await register(new Client(), 'crm-sem-aceite');
    assert.equal(await ctx.db.marketingContact.count({ where: { email: plain.email } }), 0);
    // Guest checkout with the opt-in: one contact under the normalized e-mail.
    await crmBuy(crmGuest, { marketingOptIn: true });
    const fromCheckout = await crmContact(crmGuest.toLowerCase());
    assert.equal(fromCheckout.legalBasis, 'consent');
    assert.equal(fromCheckout.consentSource, 'checkout');
    assert.equal(fromCheckout.name, 'Cliente de Homologação');
    // Account preference: off keeps the contact, on is a new consent from the account.
    const status = await crmAccount.data('account/marketing');
    assert.equal(status.subscribed, true);
    assert.equal(status.version, '2026-11-14');
    assert.match(status.text, /Posso sair quando quiser/);
    const off = await crmAccount.call('account/marketing', 'PUT', { subscribed: false });
    assert.equal(off.status, 204, off.body?.error?.code);
    assert.equal((await crmAccount.data('account/marketing')).subscribed, false);
    assert((await crmContact(crmRegistered)).unsubscribedAt);
    // Ruling R3: back in only once the account e-mail is confirmed.
    const unverified = await crmAccount.call('account/marketing', 'PUT', { subscribed: true });
    assert.equal(unverified.status, 422);
    assert.equal(unverified.body.error.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(
      unverified.body.error.message,
      'Confirme seu e-mail para voltar a receber novidades.',
    );
    assert((await crmContact(crmRegistered)).unsubscribedAt);
    assert.equal((await crmAccount.data('account/marketing')).subscribed, false);
    await ctx.db.user.update({ where: { email: crmRegistered }, data: { verifiedAt: new Date() } });
    const on = await crmAccount.call('account/marketing', 'PUT', { subscribed: true });
    assert.equal(on.status, 204, on.body?.error?.code);
    assert.equal((await crmAccount.data('account/marketing')).subscribed, true);
    const again = await crmContact(crmRegistered);
    assert.equal(again.unsubscribedAt, null);
    assert.equal(again.consentSource, 'account');
    assert.equal((await owner.call('account/marketing')).status, 403);
    assert.equal((await new Client().call('account/marketing')).status, 401);
  });
  await check('CRM: cadastro e checkout não reinscrevem um e-mail descadastrado', async () => {
    const unsubscribedAt = new Date(Date.now() - 86400000),
      consentAt = new Date(Date.now() - 2 * 86400000),
      gone = async (email) =>
        ctx.db.marketingContact.create({
          data: {
            email,
            name: 'Quem saiu',
            legalBasis: 'consent',
            consentAt,
            consentVersion: '2026-01-01',
            consentSource: 'account',
            unsubscribedAt,
          },
        }),
      unchanged = async (email) => {
        const c = await crmContact(email);
        assert.equal(c.unsubscribedAt?.getTime(), unsubscribedAt.getTime());
        assert.equal(c.consentAt?.getTime(), consentAt.getTime());
        assert.equal(c.consentSource, 'account');
        assert.equal(c.consentVersion, '2026-01-01');
        assert.equal(c.name, 'Quem saiu');
      },
      registered = crmEmail('saiu-cadastro'),
      guestEmail = crmEmail('saiu-checkout');
    await gone(registered);
    await gone(guestEmail);
    const r = await new Client().call('auth/login', 'POST', {
      name: 'Outra pessoa',
      email: registered,
      password: 'IntegrationTeste!2026',
      kind: 'customer',
      register: true,
      marketingOptIn: true,
    });
    assert.equal(r.status, 200, r.body?.error?.code);
    await unchanged(registered);
    await crmBuy(guestEmail, { marketingOptIn: true });
    await crmBuy(registered, { marketingOptIn: true });
    await unchanged(guestEmail);
    await unchanged(registered);
  });
  await check('CRM: c malformado ou desconhecido não impede o descadastro', async () => {
    const { CrmService } = await import('@maos-em-oracao/backend-core/crm');
    const crm = new CrmService(ctx),
      contacts = await Promise.all(
        ['c-longo', 'c-desconhecido', 'c-numero', 'c-repetido'].map((label) =>
          ctx.db.marketingContact.create({
            data: {
              email: crmEmail(label),
              legalBasis: 'consent',
              consentAt: new Date(),
              consentVersion: '2026-11-14',
              consentSource: 'account',
            },
          }),
        ),
      ),
      tokenOf = (id) => new URL(crm.unsubscribeLinks(id).unsubscribeUrl).searchParams.get('token'),
      oneClick = (id, query) =>
        fetch(base + '/marketing/one-click?token=' + encodeURIComponent(tokenOf(id)) + query, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        });
    assert.equal((await oneClick(contacts[0].id, '&c=' + 'x'.repeat(200))).status, 204);
    const unknown = await guest.call('marketing/unsubscribe', 'POST', {
      token: tokenOf(contacts[1].id),
      campaignId: 'campanha-que-nao-existe',
    });
    assert.equal(unknown.status, 204, unknown.body?.error?.code);
    const numeric = await guest.call('marketing/unsubscribe', 'POST', {
      token: tokenOf(contacts[2].id),
      campaignId: 12345,
    });
    assert.equal(numeric.status, 204, numeric.body?.error?.code);
    assert.equal((await oneClick(contacts[3].id, '&c=a&c=b')).status, 204);
    for (const contact of contacts) {
      const saved = await crmContact(contact.email);
      assert(saved.unsubscribedAt, contact.email);
      assert.equal(saved.unsubscribedCampaignId, null);
    }
  });
  await check('CRM: descadastro pelo link é idempotente e exige o token de marketing', async () => {
    const { CrmService } = await import('@maos-em-oracao/backend-core/crm');
    const { Notifications } = await import('@maos-em-oracao/backend-core/notifications');
    const crm = new CrmService(ctx),
      contact = await crmContact(crmGuest.toLowerCase()),
      campaign = await ctx.db.marketingCampaign.create({
        data: {
          name: 'Campanha do teste',
          subject: 'Novidades',
          blocks: [],
          segment: { rules: [] },
          createdBy: 'test',
        },
      }),
      links = crm.unsubscribeLinks(contact.id, campaign.id);
    assert(links.unsubscribeUrl.startsWith(env.PUBLIC_WEB_URL + '/email/descadastro?token='));
    assert(
      links.oneClickUnsubscribeUrl.startsWith(
        env.PUBLIC_WEB_URL + '/api/email/marketing-unsubscribe?token=',
      ),
    );
    assert.equal(new URL(links.unsubscribeUrl).searchParams.get('c'), campaign.id);
    assert.equal(
      new URL(crm.unsubscribeLinks(contact.id).unsubscribeUrl).searchParams.has('c'),
      false,
    );
    const token = new URL(links.oneClickUnsubscribeUrl).searchParams.get('token'),
      oneClick = (body) =>
        fetch(
          base +
            '/marketing/one-click?token=' +
            encodeURIComponent(token) +
            '&c=' +
            encodeURIComponent(campaign.id),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          },
        );
    assert.equal((await oneClick('List-Unsubscribe=Talvez')).status, 422);
    assert.equal((await crmContact(contact.email)).unsubscribedAt, null);
    assert.equal((await oneClick('List-Unsubscribe=One-Click')).status, 204);
    const gone = await crmContact(contact.email);
    assert(gone.unsubscribedAt);
    assert.equal(gone.unsubscribedCampaignId, campaign.id);
    const repeat = await guest.call('marketing/unsubscribe', 'POST', {
      token,
      campaignId: campaign.id,
    });
    assert.equal(repeat.status, 204, repeat.body?.error?.code);
    assert.equal(
      (await crmContact(contact.email)).unsubscribedAt.getTime(),
      gone.unsubscribedAt.getTime(),
    );
    const prayerToken = new URL(
      new Notifications(ctx).unsubscribeLinks(contact.id, 1).oneClickUnsubscribeUrl,
    ).searchParams.get('token');
    const wrong = await guest.call('marketing/unsubscribe', 'POST', { token: prayerToken });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.error.code, 'INVALID_TOKEN');
  });
  const crmTag = 'Lista da paróquia ' + runId,
    crmNew = crmEmail('importado');
  await check('CRM: importação etiqueta todos e mantém o descadastro', async () => {
    const r = await owner.call('admin/crm/contacts/import', 'POST', {
      tag: crmTag,
      consent: true,
      rows: [
        { email: crmNew.toUpperCase(), name: 'Pessoa Importada' },
        { email: crmRegistered, name: 'Outro nome' },
        { email: crmGuest, name: '' },
      ],
    });
    assert.equal(r.status, 200, r.body?.error?.code);
    assert.deepEqual(r.body.data, { created: 1, updated: 2, keptUnsubscribed: 1 });
    const [fresh, registered, unsubscribed] = await Promise.all(
      [crmNew, crmRegistered, crmGuest.toLowerCase()].map(crmContact),
    );
    assert.equal(fresh.legalBasis, 'imported-consent');
    assert.equal(fresh.consentSource, 'import');
    assert.equal(fresh.consentVersion, 'importação');
    assert.equal(fresh.name, 'Pessoa Importada');
    assert.equal(registered.legalBasis, 'consent');
    assert.equal(registered.name, 'Cliente do CRM');
    assert(unsubscribed.unsubscribedAt, 'import never re-subscribes');
    for (const c of [fresh, registered, unsubscribed]) assert(c.tags.includes(crmTag));
    // Saving tags from the admin does not touch consent or unsubscribe either.
    await owner.command({
      type: 'crm.contact.save',
      email: crmGuest,
      tags: [crmTag, '  Clientes   fiéis ', 'Clientes fiéis'],
    });
    const saved = await crmContact(crmGuest.toLowerCase());
    assert.deepEqual(saved.tags, [crmTag, 'Clientes fiéis']);
    assert(saved.unsubscribedAt);
    assert.equal(saved.legalBasis, 'consent');
    const page = await owner.data('admin/crm/contacts?tag=' + encodeURIComponent(crmTag));
    assert.deepEqual(
      page.items.map((c) => [c.email, c.eligible, c.isCustomer]),
      [
        [crmGuest.toLowerCase(), false, true],
        [crmRegistered, true, true],
        [crmNew, true, false],
      ].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    );
    const found = await owner.data(
      'admin/crm/contacts?q=' + encodeURIComponent('PESSOA IMPORTADA'),
    );
    assert.deepEqual(
      found.items.map((c) => c.email),
      [crmNew],
    );
  });
  const crmAna = 'Ana-' + runId + '@X.test';
  await check('CRM: público conta uma vez por e-mail e respeita o descadastro', async () => {
    await crmBuy(crmRegistered);
    await crmBuy(crmAna);
    await crmBuy(crmAna.toLowerCase());
    await crmBuy(crmEmail('pendente'), { status: 'Aguardando pagamento' });
    // The unsubscribed guest (crmGuest) bought too, and never comes back.
    assert.deepEqual(await crmPreview([crmBought]), {
      total: 1,
      consent: 1,
      legitimateInterest: 0,
    });
    await crmSettings({ legitimateInterest: true });
    assert.deepEqual(await crmPreview([crmBought]), {
      total: 2,
      consent: 1,
      legitimateInterest: 1,
    });
    // A contact without legal basis that bought still counts once, as legitimate interest.
    await owner.command({ type: 'crm.contact.save', email: crmAna, tags: [] });
    assert.equal((await crmContact(crmAna.toLowerCase())).legalBasis, null);
    assert.deepEqual(await crmPreview([crmBought]), {
      total: 2,
      consent: 1,
      legitimateInterest: 1,
    });
    // A suppressed e-mail (bounce/complaint) is left out.
    const { recipientHash } = await import('@maos-em-oracao/backend-core/security');
    const emailHash = recipientHash(crmRegistered, ctx.config);
    await ctx.db.emailSuppression.create({ data: { emailHash, reason: 'bounce' } });
    assert.equal((await crmPreview([crmBought])).total, 1);
    await ctx.db.emailSuppression.delete({ where: { emailHash } });
    // The admin can unsubscribe someone: the buyer leaves legitimate interest for good.
    await owner.command({ type: 'crm.contact.unsubscribe', email: crmAna });
    assert.deepEqual(await crmPreview([crmBought]), {
      total: 1,
      consent: 1,
      legitimateInterest: 0,
    });
    const snapshot = operationsSchema.parse(await owner.data('admin/operations')).crm;
    assert.equal(snapshot.settings.legitimateInterest, true);
    assert(snapshot.tags.some((t) => t.tag === crmTag && t.count === 3));
    assert(snapshot.totals.unsubscribed >= 2);
  });
  await check('CRM: regras de gasto, etiqueta, oração e última compra', async () => {
    const tag = 'Regras ' + runId,
      [recent, old, prayer, onlyPrayer] = ['recente', 'antiga', 'oracao', 'so-oracao'].map(
        crmEmail,
      );
    const prayers = (await crmPreview([{ type: 'prayer' }])).total;
    const r = await owner.call('admin/crm/contacts/import', 'POST', {
      tag,
      consent: true,
      rows: [recent, old, prayer].map((email) => ({ email, name: '' })),
    });
    assert.deepEqual(r.body.data, { created: 3, updated: 0, keptUnsubscribed: 0 });
    await crmBuy(recent, { cents: 6000, days: 5 });
    await crmBuy(recent, { cents: 3000, days: 10 });
    await crmBuy(old, { cents: 2000, days: 200 });
    for (const email of [prayer, onlyPrayer])
      await ctx.db.devotionalSubscriber.create({
        data: {
          email,
          name: 'Pessoa da oração',
          consentVersion: '2026-11-09',
          consentAt: new Date(),
          verifiedAt: new Date(),
        },
      });
    const byTag = { type: 'tag', tag };
    assert.equal((await crmPreview([byTag])).total, 3);
    assert.equal((await crmPreview([byTag, { type: 'spentAbove', cents: 8000 }])).total, 1);
    assert.equal((await crmPreview([byTag, { type: 'spentAbove', cents: 9000 }])).total, 0);
    assert.equal(
      (await crmPreview([byTag, { type: 'lastPurchase', op: 'moreThan', days: 90 }])).total,
      1,
    );
    assert.equal(
      (await crmPreview([byTag, { type: 'lastPurchase', op: 'lessThan', days: 90 }])).total,
      1,
    );
    assert.equal((await crmPreview([byTag, { type: 'prayer' }])).total, 1);
    assert.equal((await crmPreview([{ type: 'prayer' }])).total, prayers + 1);
    assert.equal(
      (await crmPreview([byTag, { type: 'category', category: crmProduct.category }])).total,
      2,
    );
    assert.equal((await crmPreview([byTag, { type: 'club' }, { type: 'groupBuy' }])).total, 0);
    await crmSettings({ legitimateInterest: false });
  });
  await check('CRM: marketing edita o remetente, só o dono muda o legítimo interesse', async () => {
    const marketing = await marketingMember(owner, 'crm-marketing'),
      current = operationsSchema.parse(await marketing.data('admin/operations')).crm.settings;
    const renamed = await crmSend(marketing, {
      type: 'crm.settings',
      settings: { ...current, senderName: 'Equipe Mãos em Oração' },
    });
    assert.equal(renamed.status, 204, renamed.body?.error?.code);
    assert.equal(
      (await owner.data('admin/operations')).crm.settings.senderName,
      'Equipe Mãos em Oração',
    );
    const flip = await crmSend(marketing, {
      type: 'crm.settings',
      settings: { ...current, legitimateInterest: !current.legitimateInterest },
    });
    assert.equal(flip.status, 403);
    assert.equal(flip.body.error.code, 'FORBIDDEN');
    assert.equal(flip.body.error.message, 'Só o dono da loja pode mudar essa chave.');
    assert.equal((await marketing.call('admin/crm/contacts')).status, 200);
    const email = crmEmail('suporte'),
      password = 'EquipeHomologacao!2026',
      support = new Client();
    await owner.command({
      type: 'invite.create',
      name: 'Suporte teste',
      email,
      role: 'support',
      permissions: ['support'],
    });
    const invite = (await owner.data('admin/operations')).invitations.find(
      (i) => i.email === email,
    );
    assert.equal(
      (
        await support.call('team/invitations/' + invite.token + '/accept', 'POST', {
          name: 'Suporte teste',
          password,
        })
      ).status,
      204,
    );
    assert.equal(
      (await support.call('auth/login', 'POST', { email, password, kind: 'staff' })).status,
      200,
    );
    const denied = await support.call('admin/crm/preview', 'POST', { segment: { rules: [] } });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
    assert.equal((await customer.call('admin/crm/contacts')).status, 403);
    const staffFlip = await crmSend(support, { type: 'crm.contact.unsubscribe', email });
    assert.equal(staffFlip.status, 403);
  });
  // ------------------------------------------------------- CRM: campanhas e disparo
  const { CrmService } = await import('@maos-em-oracao/backend-core/crm');
  // Campaign work goes through a marketing-only member, which also keeps the owner under the
  // API's per-user request limit.
  const crm = new CrmService(ctx),
    crmTeam = await marketingMember(owner, 'crm-campanhas'),
    crmTeamEmail = 'crm-campanhas-' + runId + '@example.test',
    crmBlocks = [
      { type: 'text', style: 'paragraph', text: 'Novidades da semana na loja.' },
      { type: 'products', productIds: [crmProduct.id] },
    ],
    crmSave = (name, segment, blocks, id) =>
      crmSend(crmTeam, {
        type: 'crm.campaign.save',
        campaign: {
          ...(id ? { id } : {}),
          name,
          subject: 'Assunto ' + name,
          previewText: '',
          segment,
          blocks,
        },
      }),
    crmCreate = async (label, rules, blocks = crmBlocks) => {
      const name = 'Campanha ' + label + ' ' + runId,
        r = await crmSave(name, { rules }, blocks);
      assert.equal(r.status, 204, r.body?.error?.code);
      return ctx.db.marketingCampaign.findFirstOrThrow({ where: { name } });
    },
    crmCampaign = (id) => ctx.db.marketingCampaign.findUniqueOrThrow({ where: { id } }),
    crmSchedule = (id, at = null) => crmSend(crmTeam, { type: 'crm.campaign.schedule', id, at }),
    crmLater = () => new Date(Date.now() + 3600000).toISOString(),
    crmImport = async (tag, emails) => {
      const r = await crmTeam.call('admin/crm/contacts/import', 'POST', {
        tag,
        consent: true,
        rows: emails.map((email) => ({ email, name: '' })),
      });
      assert.equal(r.status, 200, r.body?.error?.code);
    },
    crmOutbox = (id) =>
      ctx.db.outboxEvent.findMany({
        where: { aggregateId: id, kind: 'email' },
        orderBy: { availableAt: 'asc' },
      }),
    crmPrepared = (id) =>
      until(async () => {
        const row = await crmCampaign(id);
        return row.preparedAt ? row : null;
      }, 'campanha preparada'),
    /**
     * Runs the due e-mails matched by `where` with the worker code in this process, then waits
     * until none is left in the queue. The shared e-mail queue sends 1 per second and still holds
     * the e-mails of earlier flows, so waiting for it would take minutes.
     */
    crmSettle = async (where) => {
      const due = await ctx.db.outboxEvent.findMany({
        where: {
          ...where,
          state: { in: ['pending', 'enqueued'] },
          availableAt: { lte: new Date() },
        },
        select: { id: true },
      });
      // A row the real worker already claimed fails here with WORK_LEASE_BUSY and ends there.
      for (const { id } of due) await engine.process({ source: 'outbox', id }).catch(() => {});
      await until(
        async () =>
          !(await ctx.db.outboxEvent.count({
            where: { ...where, state: { in: ['pending', 'enqueued', 'processing'] } },
          })),
        'fila da campanha',
      );
    },
    crmError = (r, status, code) => {
      assert.equal(r.status, status, JSON.stringify(r.body));
      assert.equal(r.body.error.code, code);
    },
    crmWebhook = async (type, emailId, n) => {
      const body = JSON.stringify({
          type,
          created_at: new Date().toISOString(),
          data: { email_id: emailId },
        }),
        id = 'msg_crm_' + runId + '_' + n,
        timestamp = String(Math.floor(Date.now() / 1000)),
        signature =
          'v1,' +
          createHmac('sha256', signingKey).update(`${id}.${timestamp}.${body}`).digest('base64');
      const response = await fetch(base + '/webhooks/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': signature,
        },
        body,
      });
      assert.equal(response.status, 200);
    };
  await check('CRM: configuração gravada inválida volta ao padrão campo a campo', async () => {
    const saved = await ctx.db.appSetting.findUnique({ where: { key: 'crm' } }),
      write = (value) =>
        ctx.db.appSetting.upsert({
          where: { key: 'crm' },
          create: { key: 'crm', data: value },
          update: { data: value },
        });
    try {
      await write({
        senderName: 'Loja de teste',
        replyTo: 'não é e-mail',
        hourlyLimit: 'muitos',
        legitimateInterest: false,
      });
      assert.deepEqual(await crm.settings(), {
        senderName: 'Loja de teste',
        replyTo: '',
        footerText: 'Você recebe este e-mail porque autorizou novidades da Mãos em Oração.',
        hourlyLimit: 100,
        legitimateInterest: false,
      });
      await write(['lixo']);
      assert.equal((await crm.settings()).senderName, 'Mãos em Oração');
      assert.equal((await crm.settings()).hourlyLimit, 100);
    } finally {
      if (saved) await write(saved.data);
      else await ctx.db.appSetting.delete({ where: { key: 'crm' } });
    }
  });
  await check('CRM: agendamento valida público e peças e trava a edição', async () => {
    const tag = 'Agenda ' + runId,
      empty = await crmCreate('vazia', [{ type: 'tag', tag: 'Ninguém ' + runId }]);
    let r = await crmSchedule(empty.id);
    crmError(r, 422, 'EMPTY_AUDIENCE');
    assert.equal(r.body.error.message, 'Nenhum contato pode receber esta campanha.');
    await crmImport(tag, [crmEmail('agenda')]);
    const archived = {
      ...crmProduct,
      id: randomUUID(),
      sku: 'CRM-ARQ-' + runId,
      name: 'Peça arquivada do CRM',
    };
    await owner.command({ type: 'product.save', product: archived });
    await owner.command({ type: 'product.archive', id: archived.id });
    const withArchived = await crmCreate(
      'arquivada',
      [{ type: 'tag', tag }],
      [{ type: 'products', productIds: [crmProduct.id, archived.id] }],
    );
    crmError(await crmSchedule(withArchived.id), 422, 'INVALID_PRODUCT');
    assert.equal((await crmCampaign(withArchived.id)).state, 'Rascunho');
    const c = await crmCreate('agendada', [{ type: 'tag', tag }]);
    r = await crmSchedule(c.id, new Date(Date.now() - 5 * 60000).toISOString());
    crmError(r, 422, 'SCHEDULE_PAST');
    assert.equal(r.body.error.message, 'Escolha um horário futuro.');
    r = await crmSchedule(c.id, crmLater());
    assert.equal(r.status, 204, r.body?.error?.code);
    const scheduled = await crmCampaign(c.id);
    assert.equal(scheduled.state, 'Agendada');
    assert(scheduled.scheduledAt > new Date());
    r = await crmSave(c.name, { rules: [] }, crmBlocks, c.id);
    crmError(r, 422, 'CAMPAIGN_LOCKED');
    assert.equal(r.body.error.message, 'Esta campanha já foi agendada ou enviada.');
    crmError(
      await crmSend(crmTeam, { type: 'crm.campaign.delete', id: c.id }),
      422,
      'CAMPAIGN_LOCKED',
    );
    crmError(await crmSchedule(c.id, crmLater()), 422, 'CAMPAIGN_STATE');
    // Cancelled before any send (no outbox yet): it can be scheduled again.
    assert.equal((await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: c.id })).status, 204);
    const cancelled = await crmCampaign(c.id);
    assert.equal(cancelled.state, 'Cancelada');
    assert(cancelled.finishedAt);
    assert.equal((await crmSchedule(c.id, crmLater())).status, 204);
    assert.equal((await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: c.id })).status, 204);
    crmError(
      await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: c.id }),
      422,
      'CAMPAIGN_STATE',
    );
    // Drafts can be edited and deleted; unknown ids are 404.
    r = await crmSave(empty.name, { rules: [{ type: 'tag', tag }] }, crmBlocks, empty.id);
    assert.equal(r.status, 204, r.body?.error?.code);
    assert.deepEqual((await crmCampaign(empty.id)).segment, { rules: [{ type: 'tag', tag }] });
    assert.equal(
      (await crmSend(crmTeam, { type: 'crm.campaign.delete', id: empty.id })).status,
      204,
    );
    assert.equal(await ctx.db.marketingCampaign.count({ where: { id: empty.id } }), 0);
    crmError(
      await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: randomUUID() }),
      404,
      'NOT_FOUND',
    );
  });
  await check('CRM: disparo espaça os envios pelo limite por hora e não duplica', async () => {
    const tag = 'Disparo ' + runId,
      emails = ['h-a', 'h-b', 'h-c'].map(crmEmail);
    await crmImport(tag, emails);
    const c = await crmCreate('disparo', [{ type: 'tag', tag }]),
      senderName = (await crm.settings()).senderName;
    assert.equal((await crmSchedule(c.id, crmLater())).status, 204);
    // A start in the future keeps the real worker away, so the computed times stay intact.
    const startedAt = new Date(Date.now() + 600000);
    await ctx.db.marketingCampaign.update({ where: { id: c.id }, data: { startedAt } });
    await crm.fanout(c.id);
    const prepared = await crmCampaign(c.id);
    assert.equal(prepared.state, 'Enviando');
    assert.equal(prepared.audienceCount, 3);
    assert(prepared.preparedAt);
    const rows = await crmOutbox(c.id);
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.availableAt.getTime() - startedAt.getTime()),
      [0, 36000, 72000],
    );
    for (const [i, row] of rows.entries()) {
      const envelope = unseal(row.payloadEncrypted, ctx.config),
        contact = await crmContact(emails[i]);
      assert.equal(envelope.to, emails[i]);
      assert.equal(envelope.subject, c.subject);
      assert.equal(envelope.category, 'marketing');
      assert.equal(envelope.from.startsWith(senderName + ' <'), true);
      assert.equal(envelope.contactId, contact.id);
      assert.equal(envelope.marketingCampaignId, c.id);
      assert.equal(envelope.campaignId, undefined);
      assert(
        envelope.headers['List-Unsubscribe'].startsWith(
          '<' + env.PUBLIC_WEB_URL + '/api/email/marketing-unsubscribe?token=',
        ),
      );
      assert.equal(envelope.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
      assert(envelope.html.includes(env.PUBLIC_WEB_URL + '/produto/' + crmProduct.id));
      assert(envelope.text.includes('Descadastrar: ' + env.PUBLIC_WEB_URL + '/email/descadastro'));
    }
    await crm.fanout(c.id);
    assert.deepEqual(
      (await crmOutbox(c.id)).map((r) => [r.id, r.availableAt.getTime()]),
      rows.map((r) => [r.id, r.availableAt.getTime()]),
    );
    assert.equal((await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: c.id })).status, 204);
  });
  let crmQueued, crmAccepted;
  await check('CRM: fila confere o aceite e o legítimo interesse na hora do envio', async () => {
    const shelf = {
      ...crmProduct,
      id: randomUUID(),
      sku: 'CRM-FILA-' + runId,
      name: 'Peça da fila do CRM',
    };
    await owner.command({ type: 'product.save', product: shelf });
    const [a, b, gone, buyer] = ['i-a', 'i-b', 'i-c', 'i-d'].map(crmEmail);
    for (const email of [a, b, gone]) await crmBuy(email, { item: shelf, marketingOptIn: true });
    await crmBuy(buyer, { item: shelf });
    await crmSettings({ legitimateInterest: true });
    const c = await crmCreate(
      'fila',
      [{ type: 'product', productId: shelf.id }],
      [
        { type: 'text', style: 'heading', text: 'Chegou peça nova' },
        { type: 'products', productIds: [shelf.id] },
        { type: 'coupon', code: 'NAOEXISTE' + runId },
      ],
    );
    // The coupon is checked when scheduling; a draft keeps whatever the team typed.
    crmError(await crmSchedule(c.id), 422, 'INVALID_COUPON');
    assert.equal(
      (
        await crmSave(
          c.name,
          c.segment,
          [
            { type: 'text', style: 'heading', text: 'Chegou peça nova' },
            { type: 'products', productIds: [shelf.id] },
          ],
          c.id,
        )
      ).status,
      204,
    );
    assert.equal((await crmSchedule(c.id)).status, 204);
    await engine.tick();
    await engine.dispatch();
    const prepared = await crmPrepared(c.id);
    assert.equal(prepared.audienceCount, 4);
    // The buyer without consent now has a legitimate-interest contact for the links.
    const buyerContact = await crmContact(buyer);
    assert.equal(buyerContact.legalBasis, 'legitimate-interest');
    assert.equal(buyerContact.unsubscribedAt, null);
    await crmTeam.command({ type: 'crm.contact.unsubscribe', email: gone });
    await crmSettings({ legitimateInterest: false });
    await ctx.db.outboxEvent.updateMany({
      where: { aggregateId: c.id, state: 'pending' },
      data: { availableAt: new Date() },
    });
    await crmSettle({ aggregateId: c.id });
    const byEmail = new Map(
      (await crmOutbox(c.id)).map((r) => [unseal(r.payloadEncrypted, ctx.config).to, r]),
    );
    assert.deepEqual(
      [a, b, gone, buyer].map((e) => [byEmail.get(e).state, byEmail.get(e).errorCode]),
      [
        ['accepted', null],
        ['accepted', null],
        ['cancelled', 'CONSENT_REVOKED'],
        ['cancelled', 'CONSENT_REVOKED'],
      ],
    );
    await engine.tick();
    const done = await until(async () => {
      const row = await crmCampaign(c.id);
      return row.state === 'Enviada' ? row : null;
    }, 'campanha enviada');
    assert.equal(done.sent, 2);
    assert(done.finishedAt);
    crmQueued = c;
    crmAccepted = byEmail.get(a);
  });
  await check(
    'CRM: e-mail de senha passa à frente da campanha e cancelar limpa a fila',
    async () => {
      const tag = 'Espaçada ' + runId;
      await crmImport(tag, ['j-a', 'j-b'].map(crmEmail));
      await crmSettings({ hourlyLimit: 10 });
      try {
        const c = await crmCreate('espaçada', [{ type: 'tag', tag }]);
        assert.equal((await crmSchedule(c.id, crmLater())).status, 204);
        await crm.fanout(c.id);
        const { startedAt } = await crmCampaign(c.id),
          [, later] = await crmOutbox(c.id);
        assert.equal(later.availableAt.getTime() - startedAt.getTime(), 360000);
        assert.equal(
          (await other.call('auth/recover', 'POST', { email: second.email, kind: 'customer' }))
            .status,
          200,
        );
        const reset = await mail(second.user.id, 'password-reset');
        await engine.dispatch();
        await until(
          async () =>
            (await ctx.db.outboxEvent.findUnique({ where: { id: reset.row.id } })).state !==
            'pending',
          'e-mail de senha despachado',
        );
        assert.equal(
          (await ctx.db.outboxEvent.findUnique({ where: { id: later.id } })).state,
          'pending',
        );
        // Cancelling while sending empties what is still waiting in the queue.
        assert.equal(
          (await crmSend(crmTeam, { type: 'crm.campaign.cancel', id: c.id })).status,
          204,
        );
        const cancelled = await crmCampaign(c.id);
        assert.equal(cancelled.state, 'Cancelada');
        assert(cancelled.finishedAt);
        const row = await ctx.db.outboxEvent.findUnique({ where: { id: later.id } });
        assert.deepEqual([row.state, row.errorCode], ['cancelled', 'CAMPAIGN_CANCELLED']);
        crmError(await crmSchedule(c.id, crmLater()), 422, 'CAMPAIGN_STATE');
      } finally {
        await crmSettings({ hourlyLimit: 100 });
      }
    },
  );
  await check('CRM: métricas contam entrega, abertura, clique e descadastro', async () => {
    const c = crmQueued,
      providerId = crmAccepted.providerId;
    for (const [n, type] of [
      'email.delivered',
      'email.opened',
      'email.opened',
      'email.clicked',
    ].entries())
      await crmWebhook(type, providerId, n);
    // Same worker code, run here: the operations queue may still be busy with earlier flows.
    for (const row of await ctx.db.webhookInbox.findMany({
      where: { provider: 'resend', eventId: { startsWith: 'msg_crm_' + runId } },
      orderBy: { createdAt: 'asc' },
    }))
      await engine.webhook(row.id);
    assert.equal(await ctx.db.emailDeliveryEvent.count({ where: { providerId } }), 4);
    assert.equal(
      (await ctx.db.outboxEvent.findUnique({ where: { id: crmAccepted.id } })).state,
      'delivered',
    );
    const envelope = unseal(crmAccepted.payloadEncrypted, ctx.config),
      token = new URL(envelope.headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('token');
    const r = await guest.call('marketing/unsubscribe', 'POST', { token, campaignId: c.id });
    assert.equal(r.status, 204, r.body?.error?.code);
    const metrics = (await crm.metrics([c.id]))[c.id];
    assert.deepEqual(metrics, {
      audience: 4,
      sent: 2,
      delivered: 1,
      opened: 1,
      clicked: 1,
      bounced: 0,
      unsubscribed: 1,
      cancelled: 2,
    });
    const snapshot = operationsSchema.parse(await crmTeam.data('admin/operations')).crm;
    const listed = snapshot.campaigns.find((x) => x.id === c.id);
    assert.equal(listed.state, 'Enviada');
    assert.deepEqual(listed.metrics, metrics);
    assert(listed.startedAt && listed.finishedAt);
  });
  await check('CRM: envio de teste sai sem contato e tem limite por hora', async () => {
    const c = await crmCreate('teste', [{ type: 'tag', tag: 'Teste ' + runId }]),
      extra = crmEmail('teste-extra');
    const r = await crmSend(crmTeam, { type: 'crm.campaign.test', id: c.id, extra: [extra] });
    assert.equal(r.status, 204, r.body?.error?.code);
    const rows = await ctx.db.outboxEvent.findMany({
      where: { kind: 'email', key: { startsWith: 'email/crm-test/' + c.id + '/' } },
    });
    const envelopes = rows.map((row) => unseal(row.payloadEncrypted, ctx.config));
    assert.deepEqual(envelopes.map((e) => e.to).sort(), [crmTeamEmail, extra].sort());
    assert(envelopes.every((e) => e.marketingTest === true && !e.marketingCampaignId));
    assert(envelopes.every((e) => e.subject === c.subject && e.category === 'marketing'));
    assert.equal(await crmContact(extra), null);
    await crmSettle({ id: { in: rows.map((row) => row.id) } });
    assert.deepEqual(
      (await ctx.db.outboxEvent.findMany({ where: { id: { in: rows.map((row) => row.id) } } })).map(
        (row) => row.state,
      ),
      ['accepted', 'accepted'],
    );
    for (let i = 1; i < 20; i++)
      assert.equal(
        (await crmSend(crmTeam, { type: 'crm.campaign.test', id: c.id, extra: [] })).status,
        204,
      );
    crmError(
      await crmSend(crmTeam, { type: 'crm.campaign.test', id: c.id, extra: [] }),
      429,
      'RATE_LIMIT',
    );
    const after = await crmCampaign(c.id);
    assert.deepEqual([after.state, after.sent, after.startedAt], ['Rascunho', 0, null]);
    // Tests never count as the campaign's queue, so it can still be scheduled.
    assert.equal(await ctx.db.outboxEvent.count({ where: { aggregateId: c.id } }), 0);
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

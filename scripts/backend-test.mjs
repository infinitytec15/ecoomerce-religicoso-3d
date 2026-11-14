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

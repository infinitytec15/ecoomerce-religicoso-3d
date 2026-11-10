import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { operationsSchema } from '../src/lib/api/response-schemas.ts';

// Supply bootstrap credentials through stdin, never CLI arguments or tracked files.
const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const credentials = JSON.parse(Buffer.concat(input).toString('utf8'));
const origin = 'https://web-production-b7ece0dc.up.railway.app';
let cookie = '';
const checks = [];
async function call(path, method = 'GET', body) {
  const response = await fetch(origin + '/api/v1/' + path, {
    method,
    headers: { origin, cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  for (const value of response.headers.getSetCookie()) cookie = value.split(';')[0];
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  checks.push({ path, method, status: response.status });
  return { status: response.status, data: payload?.data, error: payload?.error?.code };
}
assert.equal(
  (
    await call('auth/login', 'POST', {
      email: credentials.email,
      password: credentials.password,
      kind: 'staff',
    })
  ).status,
  200,
  'Staff login',
);
try {
  const session = await call('auth/session');
  assert.equal(session.data.demo, false);
  const result = await call('admin/operations');
  assert.equal(result.status, 200, result.error);
  const data = operationsSchema.parse(result.data);
  const operationalCounts = {};
  for (const key of [
    'clients',
    'orders',
    'subscriptions',
    'charges',
    'tickets',
    'prayers',
    'editions',
    'coupons',
  ]) {
    operationalCounts[key] = data[key].length;
    assert.equal(data[key].length, 0, 'Fresh production contains unexpected ' + key);
  }
  assert(data.products.length > 0);
  assert(data.products.every((p) => p.stock === 0 && !p.model));
  assert.equal(data.workspace.originStreet, '');
  const overview = await call('admin/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.data.grossCents, 0);
  assert.equal(overview.data.activeSubscriptions, 0);
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
      const response = await call(prefix + resource + '?limit=2');
      assert.equal(response.status, 200, prefix + resource + ': ' + response.error);
    }
  }
  for (const path of ['admin/jobs', 'admin/webhooks', 'admin/integrations']) {
    const result = await call(path);
    assert.equal(result.status, 200, path + ': ' + result.error);
  }
  const product = data.products[0];
  const estimate = await call('checkout/estimate', 'POST', {
    items: [
      {
        productId: product.id,
        quantity: 1,
        color: product.colors[0],
        sizeIndex: 0,
        dedication: '',
      },
    ],
    coupon: '',
  });
  assert.equal(estimate.status, 200);
  assert.equal(estimate.data.totalCents, product.priceCents);
  await writeFile(
    'var/deployment/admin-route-report.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        operationalCounts,
        products: data.products.length,
        persistent: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `${checks.length} authenticated checks passed; ${data.products.length} products; zero fixture business records.`,
  );
} finally {
  await call('auth/logout', 'POST', {});
}

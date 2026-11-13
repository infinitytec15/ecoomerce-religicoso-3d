import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// Production checks never send valid mutation payloads or vendor operations.
// Positive business flows run separately against isolated PostgreSQL/Redis in CI.
const web = new URL(process.argv[2] || 'https://maosemoracao.com.br');
assert.equal(web.protocol, 'https:');
const routes = [];
const failures = [];
async function check(kind, method, path, allowed) {
  try {
    const response = await fetch(new URL(path, web), {
      method,
      headers: {
        origin: web.origin,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(method === 'GET' ? {} : { body: '{}' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const ok = allowed.includes(response.status);
    routes.push({ kind, method, path, status: response.status, ok });
    await response.body?.cancel();
    if (!ok) failures.push(`${method} ${path}: ${response.status}`);
  } catch (error) {
    routes.push({ kind, method, path, ok: false, error: error.name });
    failures.push(`${method} ${path}: ${error.name}`);
  }
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}
function calls(node) {
  return decorators(node)
    .map((d) => d.expression)
    .filter(ts.isCallExpression);
}
for (const file of await readdir('apps/api/src')) {
  if (!file.endsWith('.ts')) continue;
  const source = ts.createSourceFile(
    file,
    await readFile('apps/api/src/' + file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const node of source.statements.filter(ts.isClassDeclaration)) {
    const controller = calls(node).find((c) => c.expression.getText(source) === 'Controller');
    if (!controller) continue;
    const prefix = controller.arguments[0]?.text || '';
    for (const member of node.members) {
      for (const call of calls(member)) {
        const name = call.expression.getText(source);
        if (!['Get', 'Post', 'Patch', 'Put', 'Delete'].includes(name)) continue;
        // Public webhook/OAuth endpoints have their own signature/callback tests in CI.
        if (/webhooks|oauth|media\/public/.test(prefix)) continue;
        let path = [prefix, call.arguments[0]?.text || ''].filter(Boolean).join('/');
        path = path.replace(/:resource/g, 'orders').replace(/:[a-zA-Z]+/g, 'route-smoke-missing');
        if (path.startsWith('health/')) continue;
        const method = name.toUpperCase();
        const publicReads = [
          'auth/session',
          'catalog/products',
          'store/settings',
          'community/prayers',
        ];
        const allowed =
          method === 'GET' && publicReads.includes(path)
            ? [200]
            : [200, 204, 400, 401, 403, 404, 409, 422];
        await check('api-access-or-invalid-input', method, '/api/v1/' + path, allowed);
      }
    }
  }
}
async function pages(directory, segments = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'api') {
      const segment = entry.name.startsWith('(')
        ? []
        : [entry.name.replace(/\[.*?\]/g, 'route-smoke-missing')];
      await pages(directory + '/' + entry.name, [...segments, ...segment]);
    } else if (entry.name === 'page.tsx') {
      const path = '/' + segments.join('/');
      await check(
        'page-http-render',
        'GET',
        path,
        segments.includes('route-smoke-missing') ? [200, 302, 307, 308, 404] : [200, 302, 307, 308],
      );
    }
  }
}
await pages('src/app');
await check('readiness', 'GET', '/api/health', [200]);
const catalog = await fetch(new URL('/api/v1/catalog/products', web)).then((r) => r.json());
assert(catalog.data.length > 0, 'Approved catalog must be persisted');
for (const product of catalog.data) {
  await check('persisted-product-page', 'GET', '/produto/' + encodeURIComponent(product.id), [200]);
  await check('product-image', 'GET', product.image, [200]);
}
await mkdir('var/deployment', { recursive: true });
await writeFile(
  'var/deployment/route-report.json',
  JSON.stringify(
    { date: new Date().toISOString(), origin: web.origin, checks: routes, failures },
    null,
    2,
  ),
);
console.log(
  `${routes.length - failures.length}/${routes.length} route checks passed. ${catalog.data.length} persisted products.`,
);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;

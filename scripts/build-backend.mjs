import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const app = process.argv[2];
if (!['api', 'worker'].includes(app)) throw new Error('Use api ou worker.');
const external = new Set(['@prisma/client', '@prisma/client/*']);
for (const relative of [
  'package.json',
  'apps/api/package.json',
  'apps/worker/package.json',
  'packages/backend-core/package.json',
  'packages/database/package.json',
  'packages/emails/package.json',
  'packages/integrations/package.json',
]) {
  const p = JSON.parse(await readFile(new URL(relative, root), 'utf8'));
  for (const name of Object.keys(p.dependencies || {}))
    if (!name.startsWith('@maos-em-oracao/')) {
      external.add(name);
      external.add(name + '/*');
    }
}
await build({
  entryPoints: [fileURLToPath(new URL(`apps/${app}/src/main.ts`, root))],
  outfile: resolve(fileURLToPath(root), `apps/${app}/dist/main.mjs`),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  packages: 'bundle',
  external: [...external],
  tsconfig: fileURLToPath(new URL('tsconfig.backend.json', root)),
  banner: {
    js: "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
  },
});
console.log(`Build ${app} concluído.`);
if (app === 'worker') {
  await build({
    entryPoints: [fileURLToPath(new URL('apps/worker/src/model-converter.ts', root))],
    outfile: fileURLToPath(new URL('apps/worker/dist/model-converter.mjs', root)),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: [...external],
    tsconfig: fileURLToPath(new URL('tsconfig.backend.json', root)),
    banner: {
      js: "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
    },
  });
}

if (app === 'api')
  await build({
    entryPoints: [fileURLToPath(new URL('scripts/backend-seed.mjs', root))],
    outfile: fileURLToPath(new URL('apps/api/dist/seed.mjs', root)),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: [...external],
    banner: {
      js: "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
    },
  });

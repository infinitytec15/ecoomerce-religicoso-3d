import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const file = new URL('../.env.backend.local', import.meta.url);
const command = process.argv[2] || 'setup';
if (command === 'setup') {
  try {
    await readFile(file);
    console.log('Ambiente local existente preservado.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const pg = randomBytes(24).toString('hex'),
      redis = randomBytes(24).toString('hex');
    const values = {
      NODE_ENV: 'development',
      POSTGRES_PASSWORD: pg,
      REDIS_PASSWORD: redis,
      DATABASE_URL: `postgresql://meo:${pg}@127.0.0.1:5545/meo`,
      REDIS_URL: `redis://:${redis}@127.0.0.1:6385/0`,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      BFF_SHARED_SECRET: randomBytes(48).toString('hex'),
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      PUBLIC_WEB_URL: 'http://127.0.0.1:8888',
      PUBLIC_API_URL: 'http://127.0.0.1:4000',
      PORT: '4000',
      WORKER_PORT: '4001',
      INTEGRATIONS_MODE: 'mock',
      PAYMENTS_ENABLED: 'false',
      EMAIL_ENABLED: 'false',
      SPLIT_PAYMENT_ENABLED: 'true',
      BOOTSTRAP_ADMIN_EMAIL: 'gestao@maosemoracao.local',
      BOOTSTRAP_ADMIN_PASSWORD: randomBytes(20).toString('base64url'),
      SEED_DEMO_CATALOG: 'true',
      LOCAL_DATA_DIR: 'var/backend',
    };
    await writeFile(
      file,
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    console.log('Criado .env.backend.local com secrets aleatórios. Credenciais não exibidas.');
  }
} else {
  const env = { ...process.env, ...parseEnv(await readFile(file, 'utf8')) };
  const npm = process.platform === 'win32' ? process.execPath : 'npm';
  const args = {
    generate: ['run', 'backend:generate'],
    migrate: ['run', 'backend:migrate'],
    seed: ['run', 'backend:seed'],
    api: ['run', 'backend:dev'],
    worker: ['run', 'worker:dev'],
    build: ['run', 'backend:build'],
    web: ['run', 'dev', '--', '--port', '8888'],
  }[command];
  if (!args) throw new Error('Use setup, generate, migrate, seed, build, api ou worker.');
  await mkdir(new URL('../var/backend/', import.meta.url), { recursive: true });
  if (command === 'web')
    Object.assign(env, {
      NEXT_PUBLIC_DATA_MODE: 'http',
      API_BASE_URL: env.PUBLIC_API_URL + '/api/v1',
      // The BFF origin check falls back to request.nextUrl.origin, which `next dev`
      // reports as localhost; pin it to the same origin the API trusts.
      NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL || env.PUBLIC_WEB_URL,
      NEXT_DIST_DIR: '.next-http',
      NEXT_PUBLIC_ENVIRONMENT: 'staging',
      IMAGE_HOSTS: env.IMAGE_HOSTS || '',
    });
  const commandArgs =
    process.platform === 'win32'
      ? [
          process.env.npm_execpath ||
            join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
          ...args,
        ]
      : args;
  const result = spawnSync(npm, commandArgs, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
  });
  process.exitCode = result.status ?? 1;
}

import {
  defineRailway,
  postgres,
  project,
  redis,
  service,
  volume,
  github,
  preserve,
  ref,
} from 'railway/iac';

export default defineRailway(() => {
  const Redis = redis('Redis', { region: 'us-east4-eqdc4a' });
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: 'redis' };
  const Postgres = postgres('Postgres', { region: 'us-east4-eqdc4a' });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });

  // Values are private Railway variables. No provider credentials belong in Git.
  const providerKeys = [
    'MP_ACCESS_TOKEN',
    'MP_WEBHOOK_SECRET',
    'ME_ACCESS_TOKEN',
    'ME_CLIENT_ID',
    'ME_CLIENT_SECRET',
    'ME_REDIRECT_URI',
    'BUNNY_STORAGE_ZONE',
    'BUNNY_STORAGE_PASSWORD',
    'BUNNY_PUBLIC_CDN_URL',
    'BUNNY_PRIVATE_STORAGE_ZONE',
    'BUNNY_PRIVATE_STORAGE_PASSWORD',
    'BUNNY_STREAM_LIBRARY_ID',
    'BUNNY_STREAM_API_KEY',
    'BUNNY_STREAM_READ_KEY',
    'BUNNY_STREAM_CDN_HOST',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'PAYMENTS_ENABLED',
    'SPLIT_PAYMENT_ENABLED',
    'EMAIL_ENABLED',
    'NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY',
  ] as const;
  const api = service('api', {
    source: github('infinitytec15/ecoomerce-religicoso-3d', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.backend' },
    start: 'node apps/api/dist/main.mjs',
    preDeploy: 'npm run backend:migrate && node apps/api/dist/seed.mjs --if-configured',
    healthcheck: '/api/v1/health/ready',
    healthcheckTimeout: 180,
    deploy: {
      region: 'us-east4-eqdc4a',
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    env: {
      ...Object.fromEntries(providerKeys.map((key) => [key, preserve()])),
      NODE_ENV: 'production',
      PORT: '4000',
      INTEGRATIONS_MODE: 'live',
      DATABASE_URL: Postgres.env.DATABASE_URL,
      REDIS_URL: Redis.env.REDIS_URL,
      PUBLIC_WEB_URL: 'https://web-production-b7ece0dc.up.railway.app',
      PUBLIC_API_URL: 'https://api-production-fe79744c.up.railway.app',
      SESSION_SECRET: preserve(),
      BFF_SHARED_SECRET: preserve(),
      TOKEN_ENCRYPTION_KEY: preserve(),
      BOOTSTRAP_ADMIN_EMAIL: preserve(),
      BOOTSTRAP_ADMIN_PASSWORD: preserve(),
      BOOTSTRAP_EXISTING_CATALOG: 'true',
      EMAIL_FROM: 'contato@infinitytec.info',
      EMAIL_REPLY_TO: 'contato@infinitytec.info',
      ME_SANDBOX: 'false',
    },
  });
  const worker = service('worker', {
    source: github('infinitytec15/ecoomerce-religicoso-3d', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.backend' },
    start: 'node apps/worker/dist/main.mjs',
    healthcheck: '/health/ready',
    healthcheckTimeout: 180,
    deploy: {
      region: 'us-east4-eqdc4a',
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    env: {
      NODE_ENV: 'production',
      PORT: '4001',
      ...Object.fromEntries(providerKeys.map((key) => [key, ref(api, key)])),
      INTEGRATIONS_MODE: 'live',
      DATABASE_URL: Postgres.env.DATABASE_URL,
      REDIS_URL: Redis.env.REDIS_URL,
      PUBLIC_WEB_URL: api.env.PUBLIC_WEB_URL,
      PUBLIC_API_URL: api.env.PUBLIC_API_URL,
      SESSION_SECRET: api.env.SESSION_SECRET,
      BFF_SHARED_SECRET: api.env.BFF_SHARED_SECRET,
      TOKEN_ENCRYPTION_KEY: api.env.TOKEN_ENCRYPTION_KEY,
      EMAIL_FROM: api.env.EMAIL_FROM,
      EMAIL_REPLY_TO: api.env.EMAIL_REPLY_TO,
      ME_SANDBOX: 'false',
    },
  });
  const web = service('web', {
    source: github('infinitytec15/ecoomerce-religicoso-3d', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    start: 'node server.js',
    healthcheck: '/api/health',
    healthcheckTimeout: 180,
    deploy: {
      region: 'us-east4-eqdc4a',
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      NEXT_PUBLIC_DATA_MODE: 'http',
      NEXT_PUBLIC_SITE_URL: api.env.PUBLIC_WEB_URL,
      NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: ref(api, 'NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY'),
      API_BASE_URL: 'http://api.railway.internal:4000/api/v1',
      BFF_SHARED_SECRET: api.env.BFF_SHARED_SECRET,
      IMAGE_HOSTS: 'web-production-b7ece0dc.up.railway.app',
    },
  });

  return project('maos-em-oracao', {
    resources: [Redis, Postgres, postgresVolume, redisVolume, api, worker, web],
  });
});

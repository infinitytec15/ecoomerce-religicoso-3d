import { readFile } from 'node:fs/promises';
import initialStore from '../src/data/public-settings.json' with { type: 'json' };
import initialCatalog from '../src/data/legacy-seed.json' with { type: 'json' };
import { createContext, closeContext } from '@maos-em-oracao/backend-core/context';
import { hashPassword } from '@maos-em-oracao/backend-core/security';
import { permissions } from '@maos-em-oracao/backend-core/shared';
import { defaultWorkspaceSettings } from '@maos-em-oracao/contracts';
if (
  process.argv.includes('--if-configured') &&
  (!process.env.BOOTSTRAP_ADMIN_EMAIL || !process.env.BOOTSTRAP_ADMIN_PASSWORD)
) {
  console.log('Bootstrap já concluído ou não solicitado.');
  process.exit(0);
}
const ctx = createContext();
const production = ctx.config.NODE_ENV === 'production';
try {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password.length < 16)
    throw new Error(
      'Informe BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD (mínimo 16 caracteres).',
    );
  if (!(await ctx.db.user.findUnique({ where: { email } }))) {
    if (await ctx.db.user.findFirst({ where: { owner: true } }))
      throw new Error('A loja já possui responsável. Use o fluxo de convite.');
    await ctx.db.user.create({
      data: {
        email,
        name: 'Responsável pela loja',
        passwordHash: await hashPassword(password),
        role: 'admin',
        permissions,
        owner: true,
        verifiedAt: new Date(),
      },
    });
  }
  const store = structuredClone(initialStore);
  store.editionMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');
  if (ctx.config.NODE_ENV === 'production') {
    store.email = ctx.config.EMAIL_REPLY_TO;
    store.phone = '';
    store.profiles = { Católica: [], Evangélica: [], Cristã: [] };
  }
  await ctx.db.appSetting.upsert({
    where: { key: 'store' },
    create: { key: 'store', data: store },
    update: {},
  });
  await ctx.db.appSetting.upsert({
    where: { key: 'workspace' },
    create: {
      key: 'workspace',
      data: {
        ...defaultWorkspaceSettings,
        ...(production
          ? {
              originCep: '',
              originStreet: '',
              originNumber: '',
              originDistrict: '',
              originCity: '',
              originState: '',
            }
          : {}),
        privacyEmail: ctx.config.EMAIL_REPLY_TO,
        prayerReplyTo: ctx.config.EMAIL_REPLY_TO,
      },
    },
    update: {},
  });
  if (
    process.env.SEED_DEMO_CATALOG === 'true' ||
    process.env.BOOTSTRAP_EXISTING_CATALOG === 'true'
  ) {
    if (production && process.env.SEED_DEMO_CATALOG === 'true')
      throw new Error('Catálogo fictício não pode ser importado em produção.');
    const seed = initialCatalog;
    for (const p of seed.products) {
      const image = `/assets/products/${seed.products.find((x) => x.img === p.img)?.id || seed.products[0].id}.webp`,
        assetId = 'fixture-' + p.id;
      const path = new URL('../public' + image, import.meta.url),
        bytes = production ? null : await readFile(path).catch(() => null);
      if (bytes)
        await ctx.db.mediaAsset.upsert({
          where: { id: assetId },
          create: {
            id: assetId,
            uploaderId: 'local-seed',
            name: p.id + '.webp',
            kind: 'image',
            mime: 'image/webp',
            size: bytes.length,
            storage: 'local',
            state: 'ready',
            storageKey: 'seed/' + p.id + '.webp',
            data: { url: image, fixture: true },
            expiresAt: new Date('2099-01-01'),
          },
          update: {},
        });
      const product = {
        id: p.id,
        name: p.name,
        description: p.desc,
        category: p.category,
        tags: p.tags,
        priceCents: Math.round(p.price * 100),
        costCents: 0,
        imageIndex: p.img,
        image,
        badge: p.tag,
        sizes: p.sizes,
        colors: p.colors,
        active: true,
        sku: 'MEO-' + p.id.toUpperCase(),
        stock: production ? 0 : 20,
        archived: false,
        model: null,
        media: production
          ? [
              {
                id: 'catalog-' + p.id,
                kind: 'image',
                source: 'external',
                url: new URL(image, ctx.config.PUBLIC_WEB_URL).href,
                alt: p.name,
                status: 'ready',
              },
            ]
          : bytes
            ? [
                {
                  id: assetId,
                  kind: 'image',
                  source: 'upload',
                  assetId,
                  url: image,
                  alt: p.name,
                  status: 'ready',
                },
              ]
            : [],
      };
      await ctx.db.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          sku: product.sku,
          name: p.name,
          category: p.category,
          priceCents: product.priceCents,
          costCents: 0,
          stock: production ? 0 : 20,
          active: true,
          data: product,
        },
        update: {},
      });
    }
    if (!production) {
      await ctx.db.printer.upsert({
        where: { name: 'Impressora de homologação' },
        create: { name: 'Impressora de homologação', capacity: 24 },
        update: {},
      });
      await ctx.db.clubEdition.upsert({
        where: { month: store.editionMonth },
        create: {
          month: store.editionMonth,
          name: store.edition,
          status: 'Programada',
          active: true,
          data: {
            id: 'initial-edition',
            month: store.editionMonth,
            name: store.edition,
            dispatchDay: store.dispatchDay,
            status: 'Programada',
            profiles: store.profiles,
            message: 'Curadoria demonstrativa para homologação local.',
            notes: 'Valores e imagens fictícios.',
          },
        },
        update: {},
      });
    }
  }
  console.log(
    'Configuração inicial concluída. Senha e secrets não exibidos; dados existentes preservados.',
  );
} finally {
  await closeContext(ctx);
}

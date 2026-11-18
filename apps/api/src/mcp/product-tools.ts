import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  collectionSchema,
  costBreakdownSchema,
  inventoryProductSchema,
  productShippingSchema,
  type Collection,
  type InventoryProduct,
  type ProductMedia,
} from '@maos-em-oracao/contracts';
import { data, DomainError, permit, requireValue } from '@maos-em-oracao/backend-core/shared';
import { fetchRemoteImage } from './remote-image';
import { defineTool, type ToolEnv } from './tool';

const PLACEHOLDER_IMAGE = '/assets/products/placeholder.svg';
const MAX_MEDIA = 12;
const shortId = () => randomUUID().slice(0, 8);
const httpsUrl = z.url({ protocol: /^https$/ });

/** Same id shape the admin editor creates (`peca-xxxxxxxx`). */
const newProductId = () => 'peca-' + shortId();

function skuFrom(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
    .toUpperCase();
  return 'MEO-' + (slug || 'PECA') + '-' + shortId().slice(0, 4).toUpperCase();
}

/** Downloads an image, runs it through the regular admin upload pipeline and returns the asset. */
export async function uploadImageFromUrl(env: ToolEnv, url: string) {
  const image = await fetchRemoteImage(url),
    reserved = await env.media.create(env.actor, {
      name: image.name,
      mime: image.mime,
      size: image.bytes.byteLength,
      kind: 'image',
    });
  await env.media.content(env.actor, reserved.id, image.bytes);
  return env.media.complete(env.actor, reserved.id);
}

async function imageMedia(env: ToolEnv, urls: string[], assetIds: string[], alt: string) {
  const media: ProductMedia[] = [];
  for (const url of urls) {
    const asset = await uploadImageFromUrl(env, url);
    media.push({
      id: 'midia-' + shortId(),
      kind: 'image',
      source: 'upload',
      status: asset.status,
      assetId: asset.id,
      url: asset.url,
      alt: alt.slice(0, 200),
    });
  }
  for (const assetId of assetIds) {
    const asset = requireValue(
      await env.ctx.db.mediaAsset.findUnique({ where: { id: assetId } }),
      'Imagem ' + assetId + ' não encontrada. Envie-a antes com upload_image_from_url.',
    );
    if (asset.kind !== 'image')
      throw new DomainError('INVALID_ASSET', 'O arquivo ' + assetId + ' não é uma imagem.');
    media.push({
      id: 'midia-' + shortId(),
      kind: 'image',
      source: 'upload',
      assetId,
      url: data<{ url?: string }>(asset.data).url,
      alt: alt.slice(0, 200),
    });
  }
  return media;
}

const coverOf = (media: ProductMedia[] | undefined) => {
  const cover = media?.find((m) => m.kind === 'image');
  return cover ? cover.url || 'asset:' + cover.assetId : PLACEHOLDER_IMAGE;
};

/** The full editable product, as the admin editor sees it (stock and flags from the columns). */
export async function readProduct(env: ToolEnv, idOrSku: string) {
  permit(env.actor, 'catalog');
  const row = requireValue(
    await env.ctx.db.product.findFirst({
      where: { OR: [{ id: idOrSku }, { sku: idOrSku.trim().toUpperCase() }] },
    }),
    'Produto não encontrado.',
  );
  const stored = data<InventoryProduct>(row.data);
  const product: InventoryProduct = {
    ...stored,
    id: row.id,
    sku: row.sku,
    name: row.name,
    priceCents: row.priceCents,
    costCents: row.costCents,
    stock: row.stock,
    active: row.active,
    archived: row.archived,
  };
  Reflect.deleteProperty(product, 'kitSummary');
  return {
    product,
    reserved: row.reserved,
    available: Math.max(0, row.stock - row.reserved),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const imageInputs = {
  imageUrls: z
    .array(httpsUrl)
    .max(MAX_MEDIA)
    .optional()
    .describe(
      'Links HTTPS públicos de imagens (JPG, PNG, WebP, AVIF; até 12 MB cada). A primeira vira a capa.',
    ),
  imageAssetIds: z
    .array(z.string().min(1).max(100))
    .max(MAX_MEDIA)
    .optional()
    .describe('Ids de imagens já enviadas com upload_image_from_url.'),
};

const createInput = z.object({
  name: z.string().trim().min(3).max(120).describe('Nome da peça.'),
  description: z.string().trim().min(10).max(5000).describe('Descrição para a vitrine.'),
  category: collectionSchema.describe('Coleção principal.'),
  extraTags: z
    .array(collectionSchema)
    .max(5)
    .optional()
    .describe('Outras coleções onde a peça aparece.'),
  personalized: z.boolean().optional().describe('Peça personalizável (entra em "Personalizados").'),
  priceCents: z.number().int().positive().describe('Preço em centavos: R$ 89,90 = 8990.'),
  sizes: z
    .array(z.string().trim().min(1).max(40))
    .min(1)
    .max(11)
    .default(['Único'])
    .describe('Tamanhos, do menor ao maior. Padrão: ["Único"].'),
  sizePrices: z
    .array(z.number().int().positive())
    .max(11)
    .optional()
    .describe('Preço em centavos de cada tamanho, na mesma ordem de sizes.'),
  colors: z.array(z.string().trim().min(1).max(40)).min(1).max(20).default(['Padrão']),
  stock: z.number().int().nonnegative().default(0).describe('Saldo inicial em estoque.'),
  sku: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe('SKU único. Gerado a partir do nome se faltar.'),
  costCents: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe('Custo unitário em centavos (privado).'),
  costBreakdown: costBreakdownSchema.optional(),
  badge: z.string().max(40).default('').describe('Selo curto, ex.: "Novidade".'),
  active: z
    .boolean()
    .default(false)
    .describe(
      'Publicar na loja agora. Exige ao menos uma imagem; sem ela o produto fica como rascunho.',
    ),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(170).optional(),
  shipping: productShippingSchema
    .optional()
    .describe('Embalagem (gramas, cm) e prazo de produção em dias.'),
  ...imageInputs,
});

const editable = inventoryProductSchema
  .omit({ id: true, image: true, imageIndex: true, kitSummary: true, groupBuy: true, rating: true })
  .partial();

const updateInput = z.object({
  id: z.string().min(1).max(100).describe('Id ou SKU do produto.'),
  changes: editable.default({}).describe('Somente os campos que mudam; o resto é mantido.'),
  addImageUrls: imageInputs.imageUrls,
  addImageAssetIds: imageInputs.imageAssetIds,
  replaceImages: z
    .boolean()
    .default(false)
    .describe('Remove as imagens atuais antes de adicionar as novas.'),
});

export const productTools = [
  defineTool({
    name: 'list_products',
    title: 'Listar produtos',
    description:
      'Lista produtos do catálogo com preço, estoque, reservas e situação. Filtra por texto (nome ou SKU) e situação.',
    permission: 'catalog',
    readOnly: true,
    input: z.object({
      search: z.string().max(120).optional(),
      status: z.enum(['all', 'active', 'draft', 'archived']).default('all'),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
    run: async (args, env) => {
      permit(env.actor, 'catalog');
      const where = {
        ...(args.search
          ? {
              OR: [
                { name: { contains: args.search, mode: 'insensitive' as const } },
                { sku: { contains: args.search.toUpperCase() } },
              ],
            }
          : {}),
        ...{
          all: { archived: false },
          active: { active: true, archived: false },
          draft: { active: false, archived: false },
          archived: { archived: true },
        }[args.status],
      };
      const [rows, total] = await Promise.all([
        env.ctx.db.product.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: args.limit,
          skip: args.offset,
        }),
        env.ctx.db.product.count({ where }),
      ]);
      return {
        total,
        items: rows.map((r) => {
          const d = data<InventoryProduct>(r.data);
          return {
            id: r.id,
            sku: r.sku,
            name: r.name,
            category: r.category,
            priceCents: r.priceCents,
            costCents: r.costCents,
            stock: r.stock,
            reserved: r.reserved,
            active: r.active,
            archived: r.archived,
            sizes: d.sizes,
            colors: d.colors,
            image: d.image,
            kit: !!d.kit,
          };
        }),
      };
    },
  }),
  defineTool({
    name: 'get_product',
    title: 'Ver produto',
    description:
      'Retorna o cadastro completo de um produto (mídias, tamanhos, custos, frete, SEO, kit), pelo id ou SKU.',
    permission: 'catalog',
    readOnly: true,
    input: z.object({ id: z.string().min(1).max(100).describe('Id ou SKU.') }),
    run: (args, env) => readProduct(env, args.id),
  }),
  defineTool({
    name: 'create_product',
    title: 'Criar produto',
    description:
      'Cadastra uma peça nova. Preços e custos em centavos. Passe imageUrls para enviar as fotos automaticamente; com active=true a peça já aparece na loja (precisa de imagem).',
    permission: 'catalog',
    input: createInput,
    run: async (args, env) => {
      permit(env.actor, 'catalog');
      if (args.active && !args.imageUrls?.length && !args.imageAssetIds?.length)
        throw new DomainError(
          'IMAGE_REQUIRED',
          'Inclua imageUrls ou imageAssetIds para publicar, ou crie com active=false (rascunho).',
        );
      const media = await imageMedia(
        env,
        args.imageUrls ?? [],
        args.imageAssetIds ?? [],
        args.name,
      );
      const tags = new Set<Collection>([
        args.category,
        'Presentes',
        ...(args.personalized ? (['Personalizados'] as const) : []),
        ...(args.extraTags ?? []),
      ]);
      const product: InventoryProduct = {
        id: newProductId(),
        name: args.name,
        description: args.description,
        category: args.category,
        tags: [...tags],
        priceCents: args.sizePrices?.[0] ?? args.priceCents,
        imageIndex: 0,
        image: coverOf(media),
        badge: args.badge,
        sizes: args.sizes,
        sizePrices: args.sizePrices,
        colors: args.colors,
        active: args.active,
        sku: args.sku?.trim() || skuFrom(args.name),
        stock: args.stock,
        media,
        shipping: args.shipping,
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        costCents: args.costCents,
        costBreakdown: args.costBreakdown,
      };
      await env.admin.catalog.save(env.actor, product);
      return { created: true, ...(await readProduct(env, product.id)) };
    },
  }),
  defineTool({
    name: 'update_product',
    title: 'Editar produto',
    description:
      'Altera um produto existente: preço, descrição, estoque, tamanhos, cores, publicação, SEO, frete, kit etc. Envie só os campos que mudam em changes. Use addImageUrls para incluir fotos.',
    permission: 'catalog',
    input: updateInput,
    run: async (args, env) => {
      const current = (await readProduct(env, args.id)).product,
        changes = args.changes as Partial<InventoryProduct>,
        added = await imageMedia(
          env,
          args.addImageUrls ?? [],
          args.addImageAssetIds ?? [],
          changes.name ?? current.name,
        ),
        baseMedia = changes.media ?? (args.replaceImages ? [] : (current.media ?? []));
      const media = [...baseMedia, ...added];
      if (media.length > MAX_MEDIA)
        throw new DomainError('TOO_MANY_MEDIA', 'Use até 12 mídias por produto.');
      const next: InventoryProduct = { ...current, ...changes, id: current.id, media };
      next.image = coverOf(media);
      await env.admin.catalog.save(env.actor, next);
      return { updated: true, ...(await readProduct(env, current.id)) };
    },
  }),
  defineTool({
    name: 'archive_product',
    title: 'Arquivar produto',
    description: 'Tira o produto da loja e o arquiva (pode ser reativado com update_product).',
    permission: 'catalog',
    destructive: true,
    input: z.object({ id: z.string().min(1).max(100).describe('Id ou SKU.') }),
    run: async (args, env) => {
      const { product } = await readProduct(env, args.id);
      await env.admin.execute(env.actor, { type: 'product.archive', id: product.id });
      return { archived: true, id: product.id };
    },
  }),
  defineTool({
    name: 'adjust_stock',
    title: 'Ajustar estoque',
    description: 'Soma ou subtrai unidades do estoque com motivo registrado no histórico.',
    permission: 'catalog',
    input: z.object({
      id: z.string().min(1).max(100).describe('Id ou SKU.'),
      delta: z.number().int().describe('Positivo entra, negativo sai.'),
      reason: z.string().trim().min(5).max(500),
    }),
    run: async (args, env) => {
      const { product } = await readProduct(env, args.id);
      await env.admin.catalog.stock(env.actor, product.id, args.delta, args.reason);
      return readProduct(env, product.id);
    },
  }),
  defineTool({
    name: 'upload_image_from_url',
    title: 'Enviar imagem por link',
    description:
      'Baixa uma imagem de um link HTTPS público, converte para WebP e guarda na mídia da loja. Retorna o assetId para usar em create_product, update_product ou stories.',
    input: z.object({ url: httpsUrl }),
    run: async (args, env) => {
      const asset = await uploadImageFromUrl(env, args.url);
      return { assetId: asset.id, status: asset.status, url: asset.url };
    },
  }),
];

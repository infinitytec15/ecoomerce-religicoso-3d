import { z } from 'zod';
import {
  inventoryProductSchema,
  unitCostCents,
  workspaceSchema,
  publicSettingsSchema,
  type InventoryProduct,
  type ProductMedia,
  type ProductModel,
  type CatalogQuery,
} from '@maos-em-oracao/contracts';
import { transaction, lock, type Transaction } from '@maos-em-oracao/database';
import type { Context } from './context';
import { settings } from './context';
import { productDto } from './projections';
import {
  json,
  data,
  permit,
  ownerOnly,
  requireValue,
  DomainError,
  audit,
  type Actor,
} from './shared';
export class CatalogService {
  constructor(private ctx: Context) {}
  async list(query: CatalogQuery = {}) {
    const search = z
      .string()
      .max(120)
      .parse(query.search || '');
    const products = await this.ctx.db.product.findMany({
      where: {
        active: true,
        archived: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { data: { path: ['description'], string_contains: search } },
              ],
            }
          : {}),
        ...(query.category && !['Todas', 'Todos'].includes(query.category)
          ? { data: { path: ['tags'], array_contains: [query.category] } }
          : {}),
        ...(query.maxCents ? { priceCents: { lte: Number(query.maxCents) } } : {}),
      },
      orderBy: ['menor-preco', 'low'].includes(query.sort || '')
        ? { priceCents: 'asc' }
        : ['maior-preco', 'high'].includes(query.sort || '')
          ? { priceCents: 'desc' }
          : query.sort === 'name'
            ? { name: 'asc' }
            : { createdAt: 'desc' },
      take: 200,
    });
    return products
      .map((p) => productDto(p))
      .filter((p) => !query.color || query.color === 'Todos' || p.colors.includes(query.color));
  }
  async product(id: string) {
    const p = await this.ctx.db.product.findFirst({ where: { id, active: true, archived: false } });
    return p ? productDto(p) : null;
  }
  async save(actor: Actor | null, value: unknown) {
    const a = permit(actor, 'catalog'),
      p = inventoryProductSchema.parse(value);
    if (!p.sku.trim()) throw new DomainError('SKU_REQUIRED', 'Informe um SKU único.');
    return transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'product/' + p.id);
      const current = await tx.product.findUnique({ where: { id: p.id } });
      if (current && current.reserved > p.stock)
        throw new DomainError(
          'STOCK_RESERVED',
          'O saldo não pode ficar abaixo da quantidade reservada.',
          409,
        );
      const unique = await tx.product.findFirst({
        where: { sku: p.sku.trim().toUpperCase(), id: { not: p.id } },
      });
      if (unique) throw new DomainError('SKU_EXISTS', 'Este SKU já está em uso.', 409);
      const hydrated = await this.validateMedia(tx, p);
      const active = p.active && !p.archived;
      if (active && !(hydrated.media || []).some((m) => m.kind === 'image' && m.status === 'ready'))
        throw new DomainError(
          'IMAGE_REQUIRED',
          'Inclua uma imagem pronta antes de publicar o produto.',
        );
      // Each size needs its own price and cost: a short list would silently fall back to the step.
      if (
        (p.sizePrices && p.sizePrices.length !== p.sizes.length) ||
        (p.costBySize && p.costBySize.length !== p.sizes.length)
      )
        throw new DomainError('INVALID_PRICES', 'Informe preço e custo para cada tamanho.', 422);
      const v = {
        sku: p.sku.trim().toUpperCase(),
        name: p.name,
        category: p.category,
        priceCents: p.sizePrices?.[0] ?? p.priceCents,
        // Columns mirror the first size; the per-size values live in `data`.
        costCents: unitCostCents(p, 0),
        stock: p.stock,
        active,
        archived: !!p.archived,
        data: json(hydrated),
      };
      await tx.product.upsert({
        where: { id: p.id },
        create: { id: p.id, ...v },
        update: { ...v, version: { increment: 1 } },
      });
      if (!current || current.stock !== p.stock)
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            delta: p.stock - (current?.stock || 0),
            reason: current
              ? 'Saldo ajustado no cadastro do produto.'
              : 'Saldo inicial do produto.',
            actorId: a.id,
          },
        });
      await audit(tx, a.id, 'Produto salvo', p.id);
    });
  }
  private async validateMedia(tx: Transaction, p: InventoryProduct): Promise<InventoryProduct> {
    const media: ProductMedia[] = [];
    for (const entry of p.media || []) {
      if (entry.source === 'youtube') {
        const url = new URL(entry.url || '');
        if (
          !['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(
            url.hostname,
          ) ||
          url.protocol !== 'https:'
        )
          throw new DomainError('INVALID_VIDEO', 'Use um link válido do YouTube.');
        media.push({ ...entry, status: 'ready' });
        continue;
      }
      if (entry.assetId) {
        const asset = requireValue(
          await tx.mediaAsset.findUnique({ where: { id: entry.assetId } }),
          'Mídia não encontrada.',
        );
        if (!['image', 'video'].includes(asset.kind) || asset.kind !== entry.kind)
          throw new DomainError('INVALID_ASSET', 'O tipo da mídia não corresponde ao produto.');
        const d = data<{ url?: string; thumbnailUrl?: string }>(asset.data);
        media.push({
          ...entry,
          url: d.url,
          status:
            asset.state === 'ready' ? 'ready' : asset.state === 'failed' ? 'failed' : 'processing',
          source: asset.storage === 'bunny-stream' ? 'bunny-stream' : 'upload',
        });
      } else if (entry.source === 'external') {
        const url = new URL(entry.url || '');
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new DomainError('INVALID_MEDIA', 'Use uma URL HTTPS válida.');
        media.push({ ...entry, status: 'ready' });
      } else throw new DomainError('ASSET_REQUIRED', 'Envie o arquivo da mídia.');
    }
    let model: ProductModel | null = null;
    if (p.model) {
      const asset = requireValue(
        await tx.mediaAsset.findUnique({ where: { id: p.model.assetId } }),
        'Envie o arquivo STL ou 3MF para disponibilizar o modelo.',
      );
      if (asset.kind !== 'model')
        throw new DomainError('INVALID_MODEL', 'O arquivo não é um modelo 3D.');
      const d = data<{ previewUrl?: string; stats?: ProductModel['stats'] }>(asset.data);
      model = {
        assetId: asset.id,
        filename: asset.name,
        format: asset.name.toLowerCase().endsWith('.3mf') ? '3mf' : 'stl',
        status:
          asset.state === 'ready' ? 'ready' : asset.state === 'failed' ? 'failed' : 'processing',
        previewUrl: d.previewUrl,
        stats: d.stats,
      };
    }
    const cover = media.find((m) => m.kind === 'image' && m.status === 'ready');
    return { ...p, media, model, image: cover?.url || '/assets/product-placeholder.svg' };
  }
  async stock(actor: Actor | null, id: string, delta: number, reason: string) {
    const a = permit(actor, 'catalog');
    z.number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((v) => v !== 0)
      .parse(delta);
    z.string().trim().min(5).max(500).parse(reason);
    await transaction(this.ctx.db, async (tx) => {
      await lock(tx, 'stock/' + id);
      const p = requireValue(await tx.product.findUnique({ where: { id } }));
      if (p.stock + delta < p.reserved)
        throw new DomainError(
          'STOCK_RESERVED',
          'O ajuste deixaria o saldo abaixo das reservas.',
          409,
        );
      await tx.product.update({
        where: { id },
        data: { stock: { increment: delta }, version: { increment: 1 } },
      });
      await tx.stockMovement.create({ data: { productId: id, delta, reason, actorId: a.id } });
      await audit(tx, a.id, 'Estoque ajustado', id);
    });
  }
  async saveSettings(actor: Actor | null, value: unknown, workspace = false) {
    const a = ownerOnly(actor),
      v = workspace ? workspaceSchema.parse(value) : publicSettingsSchema.parse(value);
    await transaction(this.ctx.db, async (tx) => {
      await tx.appSetting.upsert({
        where: { key: workspace ? 'workspace' : 'store' },
        create: { key: workspace ? 'workspace' : 'store', data: json(v) },
        update: { data: json(v), version: { increment: 1 } },
      });
      await audit(tx, a.id, 'Configurações atualizadas', workspace ? 'workspace' : 'store');
    });
  }
  async publicSettings() {
    return (await settings(this.ctx.db)).store;
  }
}

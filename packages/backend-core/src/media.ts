import { z } from 'zod';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Context } from './context';
import { Notifications } from './notifications';
import { transaction } from '@maos-em-oracao/database';
import { permit, requireValue, DomainError, type Actor, data, json, audit } from './shared';
import type { MediaAsset, ModelStats } from '@maos-em-oracao/contracts';
export class MediaService {
  private mail: Notifications;
  constructor(private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  path(key: string) {
    if (key.includes('..') || !/^[-a-zA-Z0-9_./]+$/.test(key))
      throw new DomainError('INVALID_PATH', 'Caminho de arquivo inválido.');
    const root = resolve(this.ctx.config.LOCAL_DATA_DIR),
      path = resolve(root, key);
    if (!path.startsWith(root + sep))
      throw new DomainError('INVALID_PATH', 'Caminho de arquivo inválido.');
    return path;
  }
  async create(actor: Actor | null, value: unknown) {
    const a = permit(actor, 'catalog'),
      input = z
        .object({
          name: z.string().min(1).max(160),
          mime: z.string().max(100),
          size: z.number().int().positive(),
          kind: z.enum(['image', 'model', 'video']),
        })
        .parse(value),
      extension = extname(input.name).toLowerCase();
    if (input.size > { image: 12, model: 30, video: 150 }[input.kind] * 1024 * 1024)
      throw new DomainError('FILE_TOO_LARGE', 'O arquivo ultrapassa o limite permitido.', 413);
    if (input.kind === 'model' && !['.stl', '.3mf'].includes(extension))
      throw new DomainError('INVALID_MODEL', 'Envie um arquivo STL ou 3MF.');
    if (input.kind === 'image' && !['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(extension))
      throw new DomainError('INVALID_IMAGE', 'Use JPG, PNG, WebP ou AVIF.');
    if (input.kind === 'video' && !['.mp4', '.webm', '.mov'].includes(extension))
      throw new DomainError('INVALID_VIDEO', 'Use MP4, WebM ou MOV.');
    const id = crypto.randomUUID();
    let providerId: string | undefined,
      video: Awaited<ReturnType<Context['media']['createVideo']>> | undefined;
    if (input.kind === 'video' && this.ctx.config.INTEGRATIONS_MODE === 'live') {
      video = await this.ctx.media.createVideo(input.name);
      providerId = video.id;
    }
    await this.ctx.db.mediaAsset.create({
      data: {
        id,
        uploaderId: a.id,
        ...input,
        storage:
          input.kind === 'video' && video
            ? 'bunny-stream'
            : this.ctx.config.INTEGRATIONS_MODE === 'mock'
              ? 'local'
              : 'bunny-storage',
        storageKey: 'originals/' + id + extension,
        providerId,
        state: 'reserved',
        data: {},
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return video
      ? { id, transport: 'tus' as const, url: video.url, headers: video.headers }
      : { id, transport: 'proxy' as const, url: '/api/v1/admin/media/uploads/' + id + '/content' };
  }
  async content(actor: Actor | null, id: string, bytes: Buffer) {
    const a = permit(actor, 'catalog'),
      asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (!a.owner && asset.uploaderId !== a.id)
      throw new DomainError('FORBIDDEN', 'O upload pertence a outro integrante.', 403);
    if (asset.expiresAt < new Date() || asset.state !== 'reserved')
      throw new DomainError('UPLOAD_EXPIRED', 'Crie uma nova sessão de upload.', 409);
    if (bytes.byteLength !== asset.size || bytes.byteLength > 32 * 1024 * 1024)
      throw new DomainError('UPLOAD_SIZE', 'O tamanho recebido difere do arquivo informado.', 413);
    if (asset.storage === 'bunny-stream')
      throw new DomainError('USE_TUS', 'Envie este vídeo pelo transporte TUS.');
    const claimed = await this.ctx.db.mediaAsset.updateMany({
      where: { id, state: 'reserved' },
      data: { state: 'uploading' },
    });
    if (!claimed.count) throw new DomainError('UPLOAD_BUSY', 'Este upload já foi iniciado.', 409);
    try {
      let output: Uint8Array = bytes,
        key = asset.storageKey,
        mime = asset.mime;
      if (asset.kind === 'image') {
        const image = sharp(bytes, { limitInputPixels: 40000000, failOn: 'error' }),
          meta = await image.metadata();
        if (
          !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(meta.format || '') ||
          (meta.pages && meta.pages > 1)
        )
          throw new DomainError('INVALID_IMAGE', 'A imagem não possui um formato aceito.');
        output = await image
          .rotate()
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        key = 'images/' + id + '.webp';
        mime = 'image/webp';
      } else if (asset.kind === 'model') {
        const ext = extname(asset.name).toLowerCase();
        if (ext === '.3mf' && (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50))
          throw new DomainError('INVALID_3MF', 'O arquivo não é um pacote 3MF válido.');
        if (ext === '.stl' && bytes.length < 84 && !/^\s*solid\b/i.test(bytes.toString('utf8')))
          throw new DomainError('INVALID_STL', 'Arquivo STL inválido.');
      }
      if (asset.storage === 'local') {
        await mkdir(resolve(this.path(key), '..'), { recursive: true });
        await writeFile(this.path(key), output, { mode: 0o600 });
      } else await this.ctx.media.put(key, output, mime, asset.kind === 'model');
      await this.ctx.db.mediaAsset.update({
        where: { id },
        data: {
          storageKey: key,
          mime,
          checksum: createHash('sha256').update(output).digest('hex'),
          state: 'uploaded',
          data: json({ uploadedSize: output.byteLength }),
        },
      });
      await audit(this.ctx.db, a.id, 'Arquivo recebido', id);
    } catch (error) {
      await this.ctx.db.mediaAsset.update({
        where: { id },
        data: { state: 'failed', data: { error: 'O arquivo não pôde ser validado ou enviado.' } },
      });
      throw error;
    }
  }
  async renew(actor: Actor | null, id: string) {
    const a = permit(actor, 'catalog'),
      asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (
      (!a.owner && asset.uploaderId !== a.id) ||
      asset.storage !== 'bunny-stream' ||
      !asset.providerId
    )
      throw new DomainError('FORBIDDEN', 'Este upload não permite renovar a autorização.', 403);
    if (asset.expiresAt < new Date() || asset.state === 'ready' || asset.state === 'failed')
      throw new DomainError('UPLOAD_EXPIRED', 'Esta sessão de upload expirou.', 409);
    return {
      ...this.ctx.media.videoAuthorization(asset.providerId),
      id: asset.id,
      transport: 'tus' as const,
    };
  }
  async complete(actor: Actor | null, id: string) {
    const a = permit(actor, 'catalog'),
      asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (!a.owner && asset.uploaderId !== a.id)
      throw new DomainError('FORBIDDEN', 'Este upload pertence a outro integrante.', 403);
    if (asset.storage === 'bunny-stream') {
      await this.refreshVideo(id);
      return this.dto(requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } })));
    }
    if (asset.state === 'uploaded')
      await transaction(this.ctx.db, async (tx) => {
        if (asset.kind === 'model') {
          await tx.mediaAsset.update({ where: { id }, data: { state: 'processing' } });
          await this.mail.event(tx, 'model-convert/' + id, 'model-convert', id, { assetId: id });
        } else {
          const url =
            asset.storage === 'local'
              ? '/api/media/public/' + id + (asset.kind === 'video' ? '/video' : '/image.webp')
              : this.ctx.media.publicUrl(asset.storageKey);
          await tx.mediaAsset.update({
            where: { id },
            data: { state: 'ready', data: json({ ...data<object>(asset.data), url }) },
          });
        }
      });
    const fresh = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (['reserved', 'uploading'].includes(fresh.state))
      throw new DomainError('UPLOAD_INCOMPLETE', 'Finalize o envio antes de concluir.', 409);
    return this.dto(fresh);
  }
  dto(asset: Awaited<ReturnType<Context['db']['mediaAsset']['findUniqueOrThrow']>>): MediaAsset {
    const extra = data<Partial<MediaAsset>>(asset.data);
    return {
      id: asset.id,
      name: asset.name,
      kind: asset.kind as MediaAsset['kind'],
      mime: asset.mime,
      size: asset.size,
      storage: asset.storage as MediaAsset['storage'],
      status:
        asset.state === 'ready' ? 'ready' : asset.state === 'failed' ? 'failed' : 'processing',
      created: asset.createdAt.toISOString(),
      url: extra.url,
      previewUrl: extra.previewUrl,
      thumbnailUrl: extra.thumbnailUrl,
      stats: extra.stats,
    };
  }
  async refreshVideo(id: string) {
    const asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (!asset.providerId || asset.storage !== 'bunny-stream')
      throw new DomainError('INVALID_VIDEO', 'Vídeo não associado ao Bunny Stream.');
    const video = await this.ctx.media.video(asset.providerId),
      state =
        video.status === 4 ? 'ready' : [5, 6, 8].includes(video.status) ? 'failed' : 'processing',
      urls = this.ctx.media.videoUrls(asset.providerId);
    await this.ctx.db.mediaAsset.update({
      where: { id },
      data: { state, data: json({ ...urls, providerStatus: video.status }) },
    });
    await this.refreshProducts(id);
  }
  async processModel(id: string) {
    const asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (asset.kind !== 'model' || asset.state === 'ready') return;
    const source = this.path('processing/' + id + extname(asset.name).toLowerCase()),
      destination = this.path('processing/' + id + '.glb'),
      metadata = this.path('processing/' + id + '.json');
    await mkdir(resolve(source, '..'), { recursive: true });
    if (asset.storage === 'local')
      await writeFile(source, await readFile(this.path(asset.storageKey)), { mode: 0o600 });
    else {
      const response = await this.ctx.media.get(asset.storageKey, true);
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 30 * 1024 * 1024) {
          await reader.cancel();
          throw new DomainError('MODEL_TOO_LARGE', 'Modelo acima do limite.');
        }
        chunks.push(value);
      }
      await writeFile(source, Buffer.concat(chunks), { mode: 0o600 });
    }
    const entry =
      process.env.MODEL_CONVERTER_PATH || resolve('apps/worker/dist/model-converter.mjs');
    try {
      await new Promise<void>((resolveTask, reject) => {
        const child = spawn(
          process.execPath,
          ['--max-old-space-size=512', entry, source, destination, metadata],
          {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
            env: { PATH: process.env.PATH, NODE_ENV: 'production' },
          },
        );
        let diagnostic = '';
        child.stderr.on('data', (b) => {
          if (diagnostic.length < 2000) diagnostic += String(b);
        });
        const timeout = setTimeout(() => {
          child.kill();
          reject(new DomainError('MODEL_TIMEOUT', 'O modelo excedeu o tempo de processamento.'));
        }, 30000);
        child.once('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          if (code === 0) resolveTask();
          else
            reject(
              new DomainError(
                'MODEL_INVALID',
                diagnostic.startsWith('MODEL:')
                  ? diagnostic.slice(6, 300)
                  : 'O arquivo não pôde ser convertido.',
              ),
            );
        });
      });
      const bytes = await readFile(destination),
        stats = JSON.parse(await readFile(metadata, 'utf8')) as ModelStats,
        key = 'models/' + id + '.glb';
      if (asset.storage === 'local') {
        await mkdir(resolve(this.path(key), '..'), { recursive: true });
        await writeFile(this.path(key), bytes, { mode: 0o600 });
      } else await this.ctx.media.put(key, bytes, 'model/gltf-binary', false);
      const previewUrl =
        asset.storage === 'local'
          ? '/api/media/public/' + id + '/preview.glb'
          : this.ctx.media.publicUrl(key);
      await this.ctx.db.mediaAsset.update({
        where: { id },
        data: {
          state: 'ready',
          data: json({
            ...data<object>(asset.data),
            stats,
            previewUrl,
            previewKey: key,
            previewBytes: bytes.byteLength,
          }),
        },
      });
      await this.refreshProducts(id);
    } catch (error) {
      await this.ctx.db.mediaAsset.update({
        where: { id },
        data: {
          state: 'failed',
          data: {
            error: error instanceof DomainError ? error.message : 'Falha ao processar o modelo.',
          },
        },
      });
      await this.refreshProducts(id);
      throw error;
    }
  }
  async refreshProducts(assetId: string) {
    const asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id: assetId } })),
      meta = data<Partial<MediaAsset>>(asset.data),
      products = await this.ctx.db.product.findMany({
        where: {
          OR: [
            { data: { path: ['model', 'assetId'], equals: assetId } },
            { data: { path: ['media'], array_contains: [{ assetId }] } },
          ],
        },
        take: 1000,
      });
    for (const p of products) {
      const d = data<import('@maos-em-oracao/contracts').InventoryProduct>(p.data);
      let changed = false;
      if (d.model?.assetId === assetId) {
        d.model = {
          ...d.model,
          status:
            asset.state === 'ready' ? 'ready' : asset.state === 'failed' ? 'failed' : 'processing',
          previewUrl: meta.previewUrl,
          stats: meta.stats,
        };
        changed = true;
      }
      d.media = d.media?.map((m) => {
        if (m.assetId !== assetId) return m;
        changed = true;
        return {
          ...m,
          url: meta.url,
          status:
            asset.state === 'ready' ? 'ready' : asset.state === 'failed' ? 'failed' : 'processing',
        };
      });
      if (changed)
        await this.ctx.db.product.update({
          where: { id: p.id },
          data: { data: json(d), version: { increment: 1 } },
        });
    }
  }
  async original(actor: Actor | null, id: string) {
    const a =
      actor?.owner || actor?.permissions.includes('catalog')
        ? permit(actor, 'catalog')
        : permit(actor, 'production');
    const asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (asset.kind !== 'model' || asset.state !== 'ready')
      throw new DomainError(
        'MODEL_NOT_READY',
        'O arquivo original ainda não está disponível.',
        409,
      );
    await audit(this.ctx.db, a.id, 'Download de arquivo de produção', asset.id);
    if (asset.storage === 'local')
      return {
        bytes: await readFile(this.path(asset.storageKey)),
        filename: asset.id + extname(asset.name),
      };
    const response = await this.ctx.media.get(asset.storageKey, true);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 30 * 1024 * 1024)
      throw new DomainError('FILE_TOO_LARGE', 'Arquivo acima do limite.', 413);
    return { bytes, filename: asset.id + extname(asset.name) };
  }
  async publicFile(id: string, kind: string) {
    if (this.ctx.config.INTEGRATIONS_MODE !== 'mock')
      throw new DomainError('NOT_FOUND', 'Arquivo não encontrado.', 404);
    const asset = requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } }));
    if (asset.storage !== 'local' || asset.state !== 'ready')
      throw new DomainError('NOT_FOUND', 'Arquivo não encontrado.', 404);
    const meta = data<{ previewKey?: string }>(asset.data);
    if (kind === 'preview.glb' && asset.kind === 'model' && meta.previewKey)
      return { bytes: await readFile(this.path(meta.previewKey)), mime: 'model/gltf-binary' };
    if (kind === 'video' && asset.kind === 'video')
      return {
        bytes: await readFile(this.path(asset.storageKey)),
        mime: asset.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
      };
    if (kind === 'image.webp' && asset.kind === 'image')
      return { bytes: await readFile(this.path(asset.storageKey)), mime: asset.mime };
    throw new DomainError('NOT_FOUND', 'Arquivo não encontrado.', 404);
  }
}

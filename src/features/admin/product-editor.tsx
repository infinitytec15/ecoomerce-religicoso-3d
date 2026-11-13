'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Collection, InventoryProduct, ProductMedia, ProductModel } from '@/lib/domain/types';
import { collections } from '@/lib/domain/types';
import { useAdminAction } from './shared';
import { ProductCostFields, readCostBreakdown } from './product-cost';
import { Form, text, number } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { ProductImage } from '@/components/ui/product-image';
import { centsFromInput, uid } from '@/lib/domain/format';
import { saveAsset } from '@/lib/media/assets';
import { IS_DEMO } from '@/lib/api/config';
import { uploadMedia } from '@/lib/media/upload';
import { MediaPlayer, videoReference } from '@/features/catalog/product-media';
const Viewer = dynamic(() => import('@/features/viewer/product-viewer'), { ssr: false });
const tabs = ['Produto', 'Mídia da vitrine', 'Arquivo 3D', 'Estoque e frete', 'Busca e SEO'];
export function ProductEditor({
  product: p,
  onSuccess,
}: {
  product?: InventoryProduct;
  onSuccess: () => void;
}) {
  const [sku] = useState(() => p?.sku || 'MEO-' + Date.now().toString().slice(-6));
  const action = useAdminAction(),
    [tab, setTab] = useState(0),
    [media, setMedia] = useState<ProductMedia[]>(
      p?.media ||
        (p
          ? [{ id: 'cover-' + p.id, kind: 'image', source: 'external', url: p.image, alt: p.name }]
          : []),
    ),
    [model, setModel] = useState<ProductModel | null>(p?.model || null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [viewer, setViewer] = useState(false),
    [link, setLink] = useState('');
  async function upload(file: File, kind: 'image' | 'video' | 'model') {
    setBusy(file.name);
    setError('');
    try {
      if (kind === 'model') {
        const format = /\.3mf$/i.test(file.name) ? '3mf' : 'stl';
        if (!/\.(stl|3mf)$/i.test(file.name)) throw new Error('Envie um STL ou 3MF.');
        if (file.size > 30 * 1024 * 1024) throw new Error('O modelo deve ter até 30 MB.');
        const { parseModel, disposeModel } = await import('@/lib/media/model');
        const parsed = await parseModel(await file.arrayBuffer(), format);
        disposeModel(parsed.object);
        const asset = IS_DEMO ? await saveAsset(file, kind) : await uploadMedia(file, kind);
        setModel({
          assetId: asset.id,
          filename: file.name,
          format,
          status: asset.status,
          stats: parsed.stats,
          previewUrl: asset.previewUrl,
        });
      } else {
        if (media.length >= 12) throw new Error('Use até 12 mídias por produto.');
        const asset = IS_DEMO ? await saveAsset(file, kind) : await uploadMedia(file, kind);
        setMedia((old) => [
          ...old,
          {
            id: uid('midia'),
            kind,
            source: asset.storage === 'bunny-stream' ? 'bunny-stream' : 'upload',
            status: asset.status,
            assetId: asset.id,
            url: asset.url,
            alt: file.name.replace(/\.[^.]+$/, ''),
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setBusy('');
    }
  }
  const cover = media.find((m) => m.kind === 'image'),
    coverSrc = cover
      ? cover.assetId && !cover.url
        ? 'asset:' + cover.assetId
        : cover.url!
      : '/assets/products/placeholder.svg';
  return (
    <Form
      onInvalid={(event) => {
        const target = event.target as HTMLElement,
          panel = target.closest('[data-editor-tab]');
        if (panel) {
          setTab(Number(panel.getAttribute('data-editor-tab')));
          requestAnimationFrame(() => target.focus());
        }
      }}
      onSubmit={async (d) => {
        if (busy) throw new Error('Aguarde o envio do arquivo.');
        if (text(d, 'active') === 'true' && !cover)
          throw new Error('Adicione uma imagem da peça antes de publicar.');
        const category = text(d, 'category') as Collection;
        await action.run({
          type: 'product.save',
          product: {
            ...p,
            id: p?.id || uid('peca').toLowerCase(),
            name: text(d, 'name'),
            description: text(d, 'description'),
            category,
            tags: [
              ...new Set<Collection>([
                category,
                'Presentes',
                ...(d.has('personalized') ? ['Personalizados' as const] : []),
              ]),
            ],
            priceCents: centsFromInput(text(d, 'price')),
            image: coverSrc,
            imageIndex: p?.imageIndex || 0,
            badge: text(d, 'badge'),
            sizes: text(d, 'sizes')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            colors: text(d, 'colors')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            active: text(d, 'active') === 'true',
            archived: text(d, 'active') === 'true' ? false : p?.archived,
            sku: text(d, 'sku'),
            stock: number(d, 'stock'),
            ...readCostBreakdown(d),
            media,
            model,
            shipping: {
              weightGrams: number(d, 'weight'),
              widthCm: number(d, 'width'),
              heightCm: number(d, 'height'),
              lengthCm: number(d, 'length'),
              leadTimeDays: number(d, 'leadTime'),
            },
            seoTitle: text(d, 'seoTitle'),
            seoDescription: text(d, 'seoDescription'),
          },
        });
        onSuccess();
      }}
    >
      {(pending) => (
        <>
          <div className="admin-editor-tabs" aria-label="Áreas do cadastro">
            {tabs.map((label, i) => (
              <button key={label} type="button" aria-pressed={tab === i} onClick={() => setTab(i)}>
                {label}
              </button>
            ))}
          </div>
          <div data-editor-tab={0} hidden={tab !== 0} className="stack">
            <div className="form-grid">
              <label className="span2">
                Nome da peça
                <input name="name" required minLength={3} defaultValue={p?.name} />
              </label>
              <label>
                Preço (R$)
                <input
                  name="price"
                  type="number"
                  min="0.01"
                  step=".01"
                  required
                  defaultValue={(p?.priceCents || 8990) / 100}
                />
              </label>
              <label>
                SKU
                <input name="sku" required defaultValue={sku} />
              </label>
              <label>
                Coleção
                <select name="category" defaultValue={p?.category || 'Cristãos'}>
                  {collections.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Visibilidade
                <select name="active" defaultValue={p?.active ? 'true' : 'false'}>
                  <option value="true">Publicado</option>
                  <option value="false">Rascunho / oculto</option>
                </select>
              </label>
              <label>
                Tamanhos (separados por vírgula)
                <input
                  name="sizes"
                  required
                  defaultValue={p?.sizes.join(', ') || '15 cm, 20 cm, 25 cm'}
                />
              </label>
              <label>
                Cores (separadas por vírgula)
                <input
                  name="colors"
                  required
                  defaultValue={p?.colors.join(', ') || 'Marfim, Terracota'}
                />
              </label>
              <label className="span2">
                Selo da vitrine
                <input name="badge" maxLength={35} defaultValue={p?.badge || 'Nova peça'} />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="personalized"
                  defaultChecked={p?.tags.includes('Personalizados')}
                />
                Permitir dedicatória na embalagem
              </label>
            </div>
            <label>
              Descrição
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={1000}
                defaultValue={p?.description || 'Peça decorativa cristã em impressão 3D.'}
              />
            </label>
          </div>
          <div data-editor-tab={1} hidden={tab !== 1} className="stack">
            <div className="section-intro">
              <h3>Uma boa peça merece ser vista de perto.</h3>
              <p>
                A primeira imagem será a capa. Inclua detalhes, contexto e um vídeo do acabamento.
              </p>
            </div>
            <div className="upload-grid">
              {(['image', 'video'] as const).map((kind) => (
                <label className="upload-area" key={kind}>
                  <strong>{kind === 'image' ? 'Adicionar imagem' : 'Adicionar vídeo'}</strong>
                  <span>
                    {kind === 'image' ? 'JPG, PNG ou WebP · até 12 MB' : 'MP4 ou WebM · até 150 MB'}
                  </span>
                  <input
                    aria-label={
                      kind === 'image' ? 'Enviar imagem do produto' : 'Enviar vídeo do produto'
                    }
                    type="file"
                    accept={
                      kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm'
                    }
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file, kind);
                      e.target.value = '';
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="media-link">
              <label>
                Vídeo do YouTube ou Bunny Stream
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  try {
                    const ref = videoReference(link);
                    setMedia([
                      ...media,
                      { id: uid('video'), kind: 'video', ...ref, alt: 'Vídeo do produto' },
                    ]);
                    setLink('');
                    setError('');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Adicionar link
              </Button>
            </div>
            {media.length === 0 && (
              <p className="notice">
                Nenhuma mídia na vitrine. Adicione uma imagem da peça antes de publicar.
              </p>
            )}
            <div className="media-library">
              {media.map((m, i) => (
                <article className="media-tile" key={m.id}>
                  {m.kind === 'image' ? (
                    <ProductImage src={m.url || 'asset:' + m.assetId} alt={m.alt} sizes="180px" />
                  ) : (
                    <MediaPlayer media={m} />
                  )}
                  <label>
                    Texto alternativo
                    <input
                      value={m.alt}
                      maxLength={200}
                      onChange={(e) =>
                        setMedia(
                          media.map((x) => (x.id === m.id ? { ...x, alt: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <div className="row between">
                    <Button
                      type="button"
                      variant="text"
                      disabled={i === 0}
                      onClick={() => {
                        const copy = [...media];
                        [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                        setMedia(copy);
                      }}
                    >
                      Mover antes
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      onClick={() => setMedia(media.filter((x) => x.id !== m.id))}
                    >
                      Remover
                    </Button>
                  </div>
                  {cover?.id === m.id && <small>Capa da vitrine</small>}
                </article>
              ))}
            </div>
          </div>
          <div data-editor-tab={2} hidden={tab !== 2} className="stack">
            <div className="section-intro">
              <h3>O seu arquivo, em três dimensões.</h3>
              <p>
                O visualizador só é habilitado depois de um STL ou 3MF válido. Sem arquivo, a
                vitrine exibe apenas imagens e vídeos.
              </p>
            </div>
            <label className="upload-area model-upload">
              <strong>{model ? 'Substituir arquivo 3D' : 'Enviar STL ou 3MF'}</strong>
              <span>Até 30 MB · máximo de 1 milhão de triângulos</span>
              <input
                type="file"
                accept=".stl,.3mf"
                aria-label="Enviar arquivo STL ou 3MF"
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f, 'model');
                  e.target.value = '';
                }}
              />
            </label>
            {model ? (
              <section className="model-info">
                <strong>{model.filename}</strong>
                <p>
                  {model.stats?.triangles.toLocaleString('pt-BR')} triângulos ·{' '}
                  {model.stats?.dimensions.join(' × ')} mm
                </p>
                <div className="row wrap">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={model.status !== 'ready'}
                    onClick={() => setViewer(true)}
                  >
                    Inspecionar em 3D
                  </Button>
                  <Button type="button" variant="text" onClick={() => setModel(null)}>
                    Remover arquivo e desativar 3D
                  </Button>
                </div>
              </section>
            ) : (
              <p className="notice">Visualização 3D desativada. Envie um arquivo para ativar.</p>
            )}
            {IS_DEMO && (
              <p className="demo-text">
                Arquivo salvo apenas neste navegador. Na integração, o original vai para Bunny
                Storage e a API acompanha a conversão do modelo.
              </p>
            )}
          </div>
          <div data-editor-tab={3} hidden={tab !== 3} className="stack">
            <h3>Estoque</h3>
            <div className="form-grid">
              <label>
                Unidades disponíveis
                <input
                  name="stock"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={p?.stock ?? 0}
                />
              </label>
            </div>
            <ProductCostFields product={p} />
            <h3>Embalagem para Melhor Envio</h3>
            <p>Informe as medidas da peça embalada, incluindo proteção.</p>
            <div className="form-grid">
              {[
                ['weight', 'Peso (g)', p?.shipping?.weightGrams || 300],
                ['width', 'Largura (cm)', p?.shipping?.widthCm || 18],
                ['height', 'Altura (cm)', p?.shipping?.heightCm || 25],
                ['length', 'Comprimento (cm)', p?.shipping?.lengthCm || 18],
                ['leadTime', 'Produção (dias úteis)', p?.shipping?.leadTimeDays ?? 5],
              ].map(([name, label, value]) => (
                <label key={name}>
                  {label}
                  <input
                    name={String(name)}
                    type="number"
                    min={name === 'leadTime' ? 0 : 1}
                    required
                    defaultValue={value}
                  />
                </label>
              ))}
            </div>
          </div>
          <div data-editor-tab={4} hidden={tab !== 4} className="stack">
            <label>
              Título para busca
              <input name="seoTitle" maxLength={70} defaultValue={p?.seoTitle} />
            </label>
            <label>
              Descrição para busca
              <textarea name="seoDescription" maxLength={170} defaultValue={p?.seoDescription} />
            </label>
            <p>Na ausência desses campos, serão usados o nome e a descrição da peça.</p>
          </div>
          {busy && <p role="status">Processando {busy}…</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-footer">
            <span>
              {media.length} mídias · 3D {model ? 'ativado' : 'desativado'}
            </span>
            <Button loading={pending || !!busy}>Salvar produto</Button>
          </div>
          {viewer && model && (
            <Viewer
              open
              product={
                {
                  ...p,
                  id: p?.id || 'preview',
                  name: p?.name || 'Prévia do modelo',
                  colors: p?.colors || ['Marfim'],
                  image: coverSrc,
                  model,
                } as InventoryProduct
              }
              color="Marfim"
              onOpenChange={setViewer}
            />
          )}
        </>
      )}
    </Form>
  );
}

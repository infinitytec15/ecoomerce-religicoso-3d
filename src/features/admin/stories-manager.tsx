'use client';
import { useState } from 'react';
import {
  STORY_LIMITS,
  STORY_PLACEMENTS,
  clickRate,
  collectionSchema,
  storyPlacementLabels,
  type AdminStoryHighlight,
  type AdminStoryVideo,
  type StoryPlacement,
} from '@maos-em-oracao/contracts';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Form } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { errorMessage } from '@/lib/api/contracts';
import { IS_DEMO } from '@/lib/api/config';
import { squareCover } from '@/lib/media/cover';
import { saveAsset } from '@/lib/media/assets';
import { uploadMedia } from '@/lib/media/upload';
import { useAssetUrl } from '@/lib/media/use-asset';
import type { AdminCommand } from '@/lib/domain/types';

const COLLECTIONS = collectionSchema.options;
const videoStatusLabels: Record<AdminStoryVideo['status'], string> = {
  processing: 'Processando',
  ready: 'Pronto',
  failed: 'Falhou',
};
const processingCount = (h: AdminStoryHighlight) =>
  h.videos.filter((v) => v.status === 'processing').length;
const byPosition = <T extends { position: number }>(list: T[]) =>
  [...list].sort((a, b) => a.position - b.position);
const moved = <T,>(list: T[], index: number, delta: -1 | 1) => {
  const next = [...list];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
};
const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
const placesLabel = (h: AdminStoryHighlight) =>
  STORY_PLACEMENTS.filter((p) => h.placements.includes(p))
    .map((p) =>
      p === 'category' && h.categories.length
        ? `${storyPlacementLabels[p]} (${h.categories.join(', ')})`
        : storyPlacementLabels[p],
    )
    .join(', ');

/** Runs an admin command and keeps the failure message for the caller to show. */
function useGuardedRun() {
  const action = useAdminAction(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return {
    error,
    pending,
    clear: () => setError(''),
    go: async (command: AdminCommand, message: string) => {
      if (pending) return false;
      setError('');
      setPending(true);
      try {
        await action.run(command, message);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setPending(false);
      }
    },
  };
}

function Thumb({ source, size, alt = '' }: { source?: string; size: number; alt?: string }) {
  const url = useAssetUrl(source);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
    />
  ) : null;
}

export function StoriesManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    guarded = useGuardedRun(),
    stories = byPosition(data.stories ?? []),
    [editing, setEditing] = useState<string | null>(null),
    [videosId, setVideosId] = useState<string | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    editingStory = stories.find((s) => s.id === editing),
    videosStory = stories.find((s) => s.id === videosId),
    deleteStory = stories.find((s) => s.id === deleteId),
    allVideos = stories.flatMap((s) => s.videos);
  return (
    <>
      <AdminHeading
        title="Stories"
        description="Destaques em círculo com vídeos curtos das peças, na página inicial, no produto e nas categorias."
        actions={
          <Button type="button" onClick={() => setEditing('new')}>
            Novo destaque
          </Button>
        }
      />
      <AdminMetrics
        items={[
          {
            label: 'Destaques ativos',
            value: stories.filter((s) => s.active).length,
            note: 'Aparecem na loja quando têm vídeo pronto',
          },
          { label: 'Vídeos', value: allVideos.length, note: 'Em todos os destaques' },
          {
            label: 'Visualizações',
            value: allVideos.reduce((sum, v) => sum + v.views, 0),
            note: 'Soma aproximada de todos os vídeos',
          },
          {
            label: 'Cliques em produto',
            value: allVideos.reduce((sum, v) => sum + v.clicks, 0),
            note: 'Toques em “Ver peça”',
          },
        ]}
      />
      {guarded.error && (
        <p className="form-error" role="alert">
          {guarded.error}
        </p>
      )}
      <DataTable
        caption="Destaques de stories"
        rows={stories}
        columns={[
          {
            key: 'cover',
            label: 'Capa',
            render: (s) => <Thumb source={s.coverUrl} size={40} />,
          },
          { key: 'title', label: 'Destaque', render: (s) => s.title },
          { key: 'places', label: 'Onde aparece', render: placesLabel },
          {
            key: 'videos',
            label: 'Vídeos',
            render: (s) =>
              processingCount(s)
                ? `${s.videos.length} · ${processingCount(s)} processando`
                : `${s.videos.length}`,
          },
          {
            key: 'views',
            label: 'Visualizações',
            render: (s) => s.videos.reduce((sum, v) => sum + v.views, 0),
          },
          {
            key: 'clicks',
            label: 'Cliques',
            render: (s) => s.videos.reduce((sum, v) => sum + v.clicks, 0),
          },
          {
            key: 'status',
            label: 'Status',
            render: (s) => <StatusBadge status={s.active ? 'Ativo' : 'Inativo'} />,
          },
          {
            key: 'actions',
            label: 'Ações',
            render: (s) => {
              const index = stories.findIndex((x) => x.id === s.id),
                reorder = (delta: -1 | 1) =>
                  guarded.go(
                    {
                      type: 'story.reorder',
                      ids: moved(
                        stories.map((x) => x.id),
                        index,
                        delta,
                      ),
                    },
                    'Ordem atualizada.',
                  );
              return (
                <div className="row wrap">
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Subir ${s.title}`}
                    disabled={guarded.pending || index === 0}
                    onClick={() => void reorder(-1)}
                  >
                    Subir
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Descer ${s.title}`}
                    disabled={guarded.pending || index === stories.length - 1}
                    onClick={() => void reorder(1)}
                  >
                    Descer
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Editar ${s.title}`}
                    onClick={() => setEditing(s.id)}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Vídeos de ${s.title}`}
                    onClick={() => setVideosId(s.id)}
                  >
                    Vídeos
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small danger-text"
                    aria-label={`Excluir ${s.title}`}
                    onClick={() => setDeleteId(s.id)}
                  >
                    Excluir
                  </Button>
                </div>
              );
            },
          },
        ]}
      />
      <Modal
        open={editing !== null && (editing === 'new' || !!editingStory)}
        onOpenChange={(next) => !next && setEditing(null)}
        title={editingStory ? 'Editar destaque' : 'Novo destaque'}
        className="admin-record-drawer"
      >
        {editing !== null && (
          <HighlightEditor key={editing} story={editingStory} onDone={() => setEditing(null)} />
        )}
      </Modal>
      <Modal
        open={!!videosStory}
        onOpenChange={(next) => !next && setVideosId(null)}
        title="Vídeos"
        className="admin-record-drawer"
      >
        {videosStory && <VideosPanel key={videosStory.id} story={videosStory} />}
      </Modal>
      <Modal
        open={!!deleteStory}
        onOpenChange={(next) => !next && setDeleteId(null)}
        title="Excluir destaque"
      >
        {deleteStory && (
          <Form
            onSubmit={async () => {
              await action.run({ type: 'story.delete', id: deleteStory.id }, 'Destaque excluído.');
              setDeleteId(null);
            }}
          >
            {(pending) => (
              <>
                <p>
                  Excluir o destaque “{deleteStory.title}” e seus vídeos? As visualizações e os
                  cliques também serão apagados.
                </p>
                <div className="row wrap">
                  <Button type="button" variant="secondary" onClick={() => setDeleteId(null)}>
                    Voltar
                  </Button>
                  <Button loading={pending}>Excluir destaque</Button>
                </div>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

async function uploadAsset(file: File, kind: 'image' | 'video', onProgress?: (n: number) => void) {
  return IS_DEMO ? saveAsset(file, kind) : uploadMedia(file, kind, onProgress);
}

function HighlightEditor({ story, onDone }: { story?: AdminStoryHighlight; onDone: () => void }) {
  const action = useAdminAction(),
    [title, setTitle] = useState(story?.title ?? ''),
    [coverAssetId, setCoverAssetId] = useState(story?.coverAssetId ?? ''),
    [coverSource, setCoverSource] = useState(story?.coverUrl),
    [active, setActive] = useState(story?.active ?? true),
    [placements, setPlacements] = useState<StoryPlacement[]>(story?.placements ?? ['home']),
    [categories, setCategories] = useState<string[]>(story?.categories ?? []),
    [busy, setBusy] = useState(false),
    [coverError, setCoverError] = useState(''),
    wantsCategory = placements.includes('category');
  async function pickCover(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setCoverError('');
    try {
      const asset = await uploadAsset(await squareCover(file, STORY_LIMITS.cover), 'image');
      setCoverAssetId(asset.id);
      setCoverSource(asset.url || `asset:${asset.id}`);
    } catch (e) {
      setCoverError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Form
      onSubmit={async () => {
        if (wantsCategory && !categories.length) throw new Error('Escolha ao menos uma categoria.');
        await action.run(
          {
            type: 'story.save',
            ...(story ? { id: story.id } : {}),
            title: title.trim(),
            coverAssetId,
            active,
            placements,
            categories: wantsCategory ? COLLECTIONS.filter((c) => categories.includes(c)) : [],
          },
          story ? 'Destaque atualizado.' : 'Destaque criado.',
        );
        onDone();
      }}
    >
      {(pending) => (
        <>
          <label>
            Título
            <input
              required
              maxLength={STORY_LIMITS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <small>
              {title.length}/{STORY_LIMITS.title}
            </small>
          </label>
          <label>
            Capa
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                void pickCover(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {busy && <p className="muted">Preparando a capa…</p>}
          {coverError && (
            <p className="form-error" role="alert">
              {coverError}
            </p>
          )}
          {coverSource && <Thumb source={coverSource} size={96} alt="Prévia da capa" />}
          <label className="row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          <fieldset className="stack">
            <legend>Onde aparece</legend>
            {STORY_PLACEMENTS.map((p) => (
              <label className="row" key={p}>
                <input
                  type="checkbox"
                  checked={placements.includes(p)}
                  onChange={() => setPlacements((old) => toggle(old, p))}
                />
                {storyPlacementLabels[p]}
              </label>
            ))}
          </fieldset>
          {wantsCategory && (
            <fieldset className="stack">
              <legend>Categorias</legend>
              {COLLECTIONS.map((c) => (
                <label className="row" key={c}>
                  <input
                    type="checkbox"
                    checked={categories.includes(c)}
                    onChange={() => setCategories((old) => toggle(old, c))}
                  />
                  {c}
                </label>
              ))}
            </fieldset>
          )}
          <Button
            loading={pending}
            disabled={!title.trim() || !coverAssetId || !placements.length || busy}
          >
            Salvar destaque
          </Button>
        </>
      )}
    </Form>
  );
}

type VideoView =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'remove'; id: string };

function VideosPanel({ story }: { story: AdminStoryHighlight }) {
  const data = useAdminData(),
    guarded = useGuardedRun(),
    action = useAdminAction(),
    [view, setView] = useState<VideoView>({ kind: 'list' }),
    videos = byPosition(story.videos),
    products: ProductChoice[] = data.products ?? [],
    labelOf = (v: AdminStoryVideo) => v.caption || `vídeo ${videos.indexOf(v) + 1}`,
    targetId = view.kind === 'edit' || view.kind === 'remove' ? view.id : undefined,
    target = videos.find((v) => v.id === targetId),
    back = () => setView({ kind: 'list' });
  if (view.kind === 'add')
    return <VideoAdder story={story} products={products} onCancel={back} onDone={back} />;
  if (view.kind === 'edit' && target)
    return (
      <VideoForm
        highlightId={story.id}
        video={target}
        assetId={target.assetId}
        products={products}
        onCancel={back}
        onDone={back}
      />
    );
  if (view.kind === 'remove' && target)
    return (
      <Form
        onSubmit={async () => {
          await action.run({ type: 'story.video.delete', id: target.id }, 'Vídeo removido.');
          back();
        }}
      >
        {(pending) => (
          <>
            <p>Remover este vídeo do destaque?</p>
            <div className="row wrap">
              <Button type="button" variant="secondary" onClick={back}>
                Voltar
              </Button>
              <Button loading={pending}>Remover vídeo</Button>
            </div>
          </>
        )}
      </Form>
    );
  return (
    <div className="stack">
      <p className="notice">
        Vídeos novos ficam alguns minutos em processamento no Bunny e só aparecem na loja quando
        ficam prontos. Mudanças podem levar até 1 minuto para aparecer na loja.
      </p>
      {guarded.error && (
        <p className="form-error" role="alert">
          {guarded.error}
        </p>
      )}
      <p>{story.title}</p>
      {videos.length ? (
        <ul className="stack">
          {videos.map((v, index) => {
            const reorder = (delta: -1 | 1) =>
              guarded.go(
                {
                  type: 'story.video.reorder',
                  highlightId: story.id,
                  ids: moved(
                    videos.map((x) => x.id),
                    index,
                    delta,
                  ),
                },
                'Ordem atualizada.',
              );
            return (
              <li key={v.id} className="row wrap">
                <Thumb source={v.thumbnailUrl} size={48} />
                <div className="stack">
                  <p>
                    <StatusBadge status={videoStatusLabels[v.status]} /> {v.caption}
                  </p>
                  <small>
                    {v.productIds
                      .map((id) => products.find((p) => p.id === id)?.name)
                      .filter(Boolean)
                      .join(', ') || 'Sem peças'}
                  </small>
                  <small>
                    Visualizações <strong>{v.views}</strong> · Cliques <strong>{v.clicks}</strong> ·
                    Taxa de clique <strong>{clickRate(v.views, v.clicks)}</strong>
                  </small>
                </div>
                <div className="row wrap">
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Subir ${labelOf(v)}`}
                    disabled={guarded.pending || index === 0}
                    onClick={() => void reorder(-1)}
                  >
                    Subir
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Descer ${labelOf(v)}`}
                    disabled={guarded.pending || index === videos.length - 1}
                    onClick={() => void reorder(1)}
                  >
                    Descer
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small"
                    aria-label={`Editar ${labelOf(v)}`}
                    onClick={() => setView({ kind: 'edit', id: v.id })}
                  >
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    className="small danger-text"
                    aria-label={`Remover ${labelOf(v)}`}
                    onClick={() => setView({ kind: 'remove', id: v.id })}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Este destaque ainda não tem vídeos.</p>
      )}
      {videos.length >= STORY_LIMITS.videosPerHighlight ? (
        <p className="muted">Limite de {STORY_LIMITS.videosPerHighlight} vídeos por destaque.</p>
      ) : (
        <Button type="button" onClick={() => setView({ kind: 'add' })}>
          Adicionar vídeo
        </Button>
      )}
    </div>
  );
}

type ProductChoice = { id: string; name: string; archived?: boolean };

function VideoAdder({
  story,
  products,
  onCancel,
  onDone,
}: {
  story: AdminStoryHighlight;
  products: ProductChoice[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null),
    [assetId, setAssetId] = useState(''),
    [error, setError] = useState('');
  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      const asset = await uploadAsset(file, 'video', (n) => setProgress(Math.round(n)));
      setAssetId(asset.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }
  if (assetId)
    return (
      <VideoForm
        highlightId={story.id}
        assetId={assetId}
        products={products}
        onCancel={onCancel}
        onDone={onDone}
      />
    );
  return (
    <div className="stack">
      <label>
        Vídeo
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={progress !== null}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {progress !== null && <p role="status">Enviando… {progress}%</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={progress !== null} onClick={onCancel}>
        Voltar
      </Button>
    </div>
  );
}

function VideoForm({
  highlightId,
  video,
  assetId,
  products,
  onCancel,
  onDone,
}: {
  highlightId: string;
  video?: AdminStoryVideo;
  assetId: string;
  products: ProductChoice[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const action = useAdminAction(),
    [caption, setCaption] = useState(video?.caption ?? ''),
    [productIds, setProductIds] = useState<string[]>(video?.productIds ?? []),
    [active, setActive] = useState(video?.active ?? true),
    full = productIds.length >= STORY_LIMITS.productsPerVideo,
    choices = products.filter((p) => !p.archived || productIds.includes(p.id));
  return (
    <Form
      onSubmit={async () => {
        await action.run(
          {
            type: 'story.video.save',
            ...(video ? { id: video.id } : {}),
            highlightId,
            assetId,
            caption: caption.trim(),
            productIds,
            active,
          },
          video ? 'Vídeo atualizado.' : 'Vídeo adicionado.',
        );
        onDone();
      }}
    >
      {(pending) => (
        <>
          <label>
            Legenda
            <textarea
              maxLength={STORY_LIMITS.caption}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <small>
              {caption.length}/{STORY_LIMITS.caption}
            </small>
          </label>
          <fieldset className="stack">
            <legend>Peças</legend>
            {choices.map((p) => (
              <label className="row" key={p.id}>
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  disabled={full && !productIds.includes(p.id)}
                  onChange={() => setProductIds((old) => toggle(old, p.id))}
                />
                {p.name}
                {p.archived ? ' (arquivada)' : ''}
              </label>
            ))}
            <small>Até {STORY_LIMITS.productsPerVideo} peças por vídeo.</small>
          </fieldset>
          <label className="row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativo
          </label>
          <div className="row wrap">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Voltar
            </Button>
            <Button loading={pending}>Salvar vídeo</Button>
          </div>
        </>
      )}
    </Form>
  );
}

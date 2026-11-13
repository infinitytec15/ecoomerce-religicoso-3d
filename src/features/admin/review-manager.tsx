'use client';
import { useState } from 'react';
import type { AdminReview } from '@maos-em-oracao/contracts';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, useAdminFilter, useAdminAction } from './shared';
import { RatingStars, formatRating } from '@/features/catalog/rating-stars';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { StatusBadge } from '@/components/ui/status-badge';
import { dateLabel } from '@/lib/domain/format';
const excerpt = (value: string) => (value.length > 160 ? value.slice(0, 160) + '…' : value);
export function ReviewManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    [id, setId] = useState<string | null>(null),
    reviews: AdminReview[] = data.reviews ?? [],
    current = reviews.find((r) => r.id === id),
    filter = useAdminFilter(
      reviews,
      (r) => [r.productName, r.title, r.text, r.customerName, r.orderNumber].join(' '),
      (r) => r.status,
      ['Todos', 'Em análise', 'Publicado', 'Oculto'],
    ),
    published = reviews.filter((r) => r.status === 'Publicado');
  return (
    <>
      <AdminHeading
        title="Avaliações"
        description="Revise o que os clientes escreveram, publique e responda em nome da loja."
      />
      <AdminMetrics
        items={[
          {
            label: 'Em análise',
            value: reviews.filter((r) => r.status === 'Em análise').length,
            note: 'Aguardando sua revisão',
          },
          { label: 'Publicadas', value: published.length, note: 'Visíveis na loja' },
          {
            label: 'Nota média publicada',
            value: published.length
              ? formatRating(published.reduce((sum, r) => sum + r.rating, 0) / published.length)
              : '—',
            note: 'Somente avaliações publicadas',
          },
          {
            label: 'Com fotos',
            value: reviews.filter((r) => r.photos.length > 0).length,
            note: 'Fotos enviadas por clientes',
          },
        ]}
      />
      {filter.toolbar}
      <div className="admin-prayer-list">
        {filter.rows.map((r) => (
          <article key={r.id} className="admin-panel">
            <div className="row between wrap">
              <span>
                {r.productName} · {dateLabel(r.createdAt)}
              </span>
              <StatusBadge status={r.status} />
            </div>
            <RatingStars value={r.rating} />
            <h2>{r.title}</h2>
            <p>{excerpt(r.text)}</p>
            {r.photos.length > 0 && <ReviewPhotos photos={r.photos} size={64} />}
            <div className="row between wrap">
              <small>
                {r.customerName} · Pedido {r.orderNumber}
                {r.reply ? ' · Com resposta da loja' : ''}
              </small>
              <Button variant="secondary" className="small" onClick={() => setId(r.id)}>
                Revisar avaliação
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!filter.rows.length && <p className="notice">Nenhuma avaliação nesta seleção.</p>}
      <Modal
        open={!!current}
        onOpenChange={(open) => !open && setId(null)}
        title="Revisão da avaliação"
        className="admin-record-drawer"
      >
        {current && (
          <div className="stack">
            <RatingStars value={current.rating} />
            <h2>{current.title}</h2>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{current.text}</p>
            {current.photos.length > 0 && <ReviewPhotos photos={current.photos} size={120} />}
            <p>
              {current.productName} · {current.customerName} ({current.customerEmail}) · Pedido{' '}
              {current.orderNumber} · {dateLabel(current.createdAt)}
            </p>
            <Form
              onSubmit={async (d) => {
                await action.run(
                  {
                    type: 'review.moderate',
                    id: current.id,
                    status: text(d, 'status') as 'Publicado' | 'Em análise' | 'Oculto',
                    reply: text(d, 'reply'),
                  },
                  'Avaliação atualizada.',
                );
                setId(null);
              }}
            >
              {(pending) => (
                <>
                  <label>
                    Status
                    <select name="status" defaultValue={current.status}>
                      <option>Em análise</option>
                      <option>Publicado</option>
                      <option>Oculto</option>
                    </select>
                  </label>
                  <label>
                    Resposta pública da loja
                    <textarea name="reply" maxLength={1000} defaultValue={current.reply ?? ''} />
                  </label>
                  <p className="notice">
                    A resposta aparece junto da avaliação quando ela está publicada. Deixe em branco
                    para não responder.
                  </p>
                  <Button loading={pending}>Salvar moderação</Button>
                </>
              )}
            </Form>
          </div>
        )}
      </Modal>
    </>
  );
}
function ReviewPhotos({ photos, size }: { photos: { url: string }[]; size: number }) {
  return (
    <div className="row wrap">
      {photos.map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={photo.url}
          alt={`Foto ${i + 1} da avaliação`}
          width={size}
          height={size}
          style={{ objectFit: 'cover', borderRadius: 8 }}
        />
      ))}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useProductReviews } from '@/lib/api/query';
import { dateLabel } from '@/lib/domain/format';
import { useAssetUrl } from '@/lib/media/use-asset';
import { Modal } from '@/components/ui/modal';
import { RatingStars, formatRating, reviewCountLabel } from './rating-stars';

function PhotoThumb({ url, author }: { url: string; author: string }) {
  const [open, setOpen] = useState(false),
    src = useAssetUrl(url);
  if (!src) return null;
  return (
    <li>
      <button
        type="button"
        className="review-photo"
        aria-label={`Ampliar foto de ${author}`}
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" />
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Foto da avaliação">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="review-photo-full" src={src} alt={`Foto enviada por ${author}`} />
      </Modal>
    </li>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const [rating, setRating] = useState<number>(),
    { data } = useProductReviews(productId, rating),
    [lastSummary, setLastSummary] = useState(data?.summary);
  if (data && data.summary !== lastSummary) setLastSummary(data.summary);
  const summary = data?.summary ?? lastSummary,
    max = Math.max(1, ...(summary?.histogram ?? []));
  return (
    <section className="section product-reviews" id="avaliacoes" aria-labelledby="avaliacoes-title">
      <div className="section-header">
        <h2 id="avaliacoes-title">Avaliações</h2>
      </div>
      {summary && summary.count > 0 ? (
        <>
          <div className="reviews-summary">
            <div className="reviews-average">
              <strong>{formatRating(summary.average)}</strong>
              <RatingStars value={summary.average} size={20} />
              <span>{reviewCountLabel(summary.count)}</span>
            </div>
            <div className="reviews-histogram">
              {[5, 4, 3, 2, 1].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={rating === n ? 'selected' : ''}
                  aria-pressed={rating === n}
                  aria-label={`Só ${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                  onClick={() => setRating(n)}
                >
                  <span>{n}★</span>
                  <i>
                    <b style={{ width: `${(summary.histogram[n - 1] / max) * 100}%` }} />
                  </i>
                  <span>{summary.histogram[n - 1]}</span>
                </button>
              ))}
              <button
                type="button"
                className={`reviews-all ${rating === undefined ? 'selected' : ''}`}
                aria-pressed={rating === undefined}
                onClick={() => setRating(undefined)}
              >
                Todas
              </button>
            </div>
          </div>
          <ul className="reviews-list">
            {(data?.reviews ?? []).map((r) => (
              <li key={r.id} className="review-item">
                <RatingStars value={r.rating} />
                {r.title && <h3>{r.title}</h3>}
                <p>{r.text}</p>
                <small className="review-meta">
                  {r.author} · {dateLabel(r.createdAt)}
                  {r.variant ? ` · ${r.variant}` : ''}
                </small>
                {r.photos.length > 0 && (
                  <ul className="review-photos">
                    {r.photos.map((photo) => (
                      <PhotoThumb key={photo.url} url={photo.url} author={r.author} />
                    ))}
                  </ul>
                )}
                {r.reply && (
                  <div className="review-reply">
                    <strong>Resposta da loja</strong>
                    <p>{r.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        data && <p className="reviews-empty">Ainda não há avaliações desta peça.</p>
      )}
    </section>
  );
}

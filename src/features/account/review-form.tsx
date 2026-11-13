'use client';
import { useRef, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api/contracts';
import { useCommand } from '@/lib/api/query';
import { uploadMedia } from '@/lib/media/upload';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useNotify } from '@/components/ui/feedback';
const MAX_PHOTOS = 3;
const apiMessages: Record<string, string> = {
  ALREADY_REVIEWED: 'Esta peça já foi avaliada.',
  NOT_DELIVERED: 'Só dá para avaliar peças de pedidos entregues.',
  INVALID_PHOTO: 'Não foi possível usar uma das fotos. Envie novamente.',
};
interface Photo {
  key: string;
  name: string;
  progress: number;
  assetId?: string;
  error?: string;
}
export function ReviewForm({
  item,
  onDone,
}: {
  item: { itemId: string; name: string };
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [photos, setPhotos] = useState<Photo[]>([]),
    attempt = useRef(''),
    picker = useRef<HTMLInputElement>(null),
    notify = useNotify(),
    send = useCommand(
      (
        g,
        {
          key,
          ...input
        }: {
          key: string;
          orderItemId: string;
          rating: number;
          title: string;
          text: string;
          photoIds: string[];
        },
      ) => g.createReview(input, key),
    ),
    uploading = photos.some((p) => !p.assetId && !p.error),
    patch = (key: string, change: Partial<Photo>) =>
      setPhotos((all) => all.map((p) => (p.key === key ? { ...p, ...change } : p)));
  async function addPhotos(files: FileList | null) {
    const room = MAX_PHOTOS - photos.length,
      chosen = Array.from(files || []).slice(0, Math.max(room, 0));
    if (picker.current) picker.current.value = '';
    const added = chosen.map((file) => ({
      file,
      photo: { key: crypto.randomUUID(), name: file.name, progress: 0 } satisfies Photo,
    }));
    setPhotos((all) => [...all, ...added.map((a) => a.photo)]);
    await Promise.all(
      added.map(async ({ file, photo }) => {
        try {
          const asset = await uploadMedia(
            file,
            'image',
            (p) => patch(photo.key, { progress: p }),
            'reviews',
          );
          patch(photo.key, { assetId: asset.id, progress: 100 });
        } catch (error) {
          patch(photo.key, { error: errorMessage(error) });
        }
      }),
    );
  }
  return (
    <Form
      className="stack review-form"
      onSubmit={async () => {
        if (!rating) throw new Error('Escolha uma nota de 1 a 5 estrelas.');
        if (body.trim().length < 10)
          throw new Error('Conte um pouco mais: o texto precisa ter pelo menos 10 caracteres.');
        if (uploading) throw new Error('Aguarde o envio das fotos terminar.');
        if (photos.some((p) => p.error))
          throw new Error('Remova as fotos com problema antes de enviar.');
        if (!attempt.current) attempt.current = crypto.randomUUID();
        try {
          await send.mutateAsync({
            key: attempt.current,
            orderItemId: item.itemId,
            rating,
            title: title.trim(),
            text: body.trim(),
            photoIds: photos.flatMap((p) => (p.assetId ? [p.assetId] : [])),
          });
        } catch (error) {
          const known = error instanceof ApiError ? apiMessages[error.code] : undefined;
          throw known ? new Error(known) : error;
        }
        notify('Obrigado! Sua avaliação foi enviada.');
        onDone();
      }}
    >
      {(pending) => (
        <>
          <p className="review-form-item">{item.name}</p>
          <fieldset className="review-stars">
            <legend>Nota</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={n <= rating ? 'on' : ''}>
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  aria-label={n === 1 ? '1 estrela' : `${n} estrelas`}
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </fieldset>
          <label>
            Título (opcional)
            <input
              name="title"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div>
            <label>
              Conte como ficou a peça
              <textarea
                name="text"
                rows={5}
                maxLength={2000}
                value={body}
                aria-describedby="review-counter"
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <small id="review-counter" className="review-counter">
              {body.length}/2000
            </small>
          </div>
          <div className="review-photos">
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              aria-label="Escolher fotos"
              onChange={(e) => void addPhotos(e.target.files)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={photos.length >= MAX_PHOTOS}
              onClick={() => picker.current?.click()}
            >
              Adicionar foto
            </Button>
            <small>Até {MAX_PHOTOS} fotos, de até 8 MB cada.</small>
            {photos.length > 0 && (
              <ul>
                {photos.map((p, i) => (
                  <li key={p.key}>
                    <span>{p.name}</span>
                    <small role={p.error ? 'alert' : undefined}>
                      {p.error || (p.assetId ? 'Pronta' : `Enviando ${Math.round(p.progress)}%`)}
                    </small>
                    <button
                      type="button"
                      className="text-btn"
                      aria-label={`Remover foto ${i + 1}`}
                      onClick={() => setPhotos((all) => all.filter((x) => x.key !== p.key))}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button loading={pending} disabled={uploading}>
            Enviar avaliação
          </Button>
        </>
      )}
    </Form>
  );
}

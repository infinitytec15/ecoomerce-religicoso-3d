'use client';
import { useState } from 'react';
import { CRM_LIMITS } from '@maos-em-oracao/contracts';
import { useAdminData } from '../admin-frame';
import type { BlockDraft } from './block-editor';
import { errorMessage } from '@/lib/api/contracts';
import { IS_DEMO } from '@/lib/api/config';
import { saveAsset } from '@/lib/media/assets';
import { uploadMedia } from '@/lib/media/upload';
import { useAssetUrl } from '@/lib/media/use-asset';

function ImageFields({
  n,
  block,
  onChange,
}: {
  n: number;
  block: Extract<BlockDraft, { type: 'image' }>;
  onChange: (block: BlockDraft) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    preview = useAssetUrl(block.source);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const asset = await (IS_DEMO ? saveAsset(file, 'image') : uploadMedia(file, 'image'));
      onChange({ ...block, assetId: asset.id, source: asset.url || `asset:${asset.id}` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label>
        Imagem do bloco {n}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {busy && <small>Enviando…</small>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {block.assetId &&
        (preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" width={120} style={{ maxWidth: 120, height: 'auto' }} />
        ) : (
          <small>Imagem enviada.</small>
        ))}
      <label>
        Texto alternativo do bloco {n}
        <input
          maxLength={120}
          value={block.alt}
          onChange={(e) => onChange({ ...block, alt: e.target.value })}
        />
      </label>
      <label>
        Link da imagem do bloco {n} (opcional)
        <input
          type="url"
          placeholder="https://"
          value={block.href}
          onChange={(e) => onChange({ ...block, href: e.target.value })}
        />
      </label>
    </>
  );
}

function ProductFields({
  n,
  block,
  onChange,
}: {
  n: number;
  block: Extract<BlockDraft, { type: 'products' }>;
  onChange: (block: BlockDraft) => void;
}) {
  const products = useAdminData().products.filter((p) => p.active && !p.archived),
    full = block.productIds.length >= CRM_LIMITS.productsPerBlock;
  return (
    <fieldset>
      <legend>
        Produtos do bloco {n} ({block.productIds.length}/{CRM_LIMITS.productsPerBlock})
      </legend>
      {products.map((p) => {
        const checked = block.productIds.includes(p.id);
        return (
          <label key={p.id} className="row">
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && full}
              onChange={() =>
                onChange({
                  ...block,
                  productIds: checked
                    ? block.productIds.filter((id) => id !== p.id)
                    : [...block.productIds, p.id],
                })
              }
            />
            {p.name}
          </label>
        );
      })}
    </fieldset>
  );
}

function CouponFields({
  n,
  block,
  onChange,
}: {
  n: number;
  block: Extract<BlockDraft, { type: 'coupon' }>;
  onChange: (block: BlockDraft) => void;
}) {
  // Marketing-only members may not receive coupons: fall back to typing the code (the server validates it).
  const coupons = (useAdminData().coupons ?? []).filter((c) => c.active);
  return (
    <>
      {coupons.length ? (
        <label>
          Cupom do bloco {n}
          <select value={block.code} onChange={(e) => onChange({ ...block, code: e.target.value })}>
            <option value="">Escolha o cupom</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Código do cupom do bloco {n}
          <input
            maxLength={40}
            value={block.code}
            onChange={(e) => onChange({ ...block, code: e.target.value.toUpperCase() })}
          />
        </label>
      )}
      <label>
        Texto do cupom do bloco {n}
        <input
          maxLength={240}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      </label>
    </>
  );
}

export function BlockFields({
  n,
  block,
  onChange,
}: {
  n: number;
  block: BlockDraft;
  onChange: (block: BlockDraft) => void;
}) {
  switch (block.type) {
    case 'text':
      return (
        <label>
          Texto do bloco {n}
          {block.style === 'heading' ? (
            <input
              maxLength={CRM_LIMITS.text}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          ) : (
            <textarea
              rows={4}
              maxLength={CRM_LIMITS.text}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          )}
        </label>
      );
    case 'image':
      return <ImageFields n={n} block={block} onChange={onChange} />;
    case 'products':
      return <ProductFields n={n} block={block} onChange={onChange} />;
    case 'button':
      return (
        <>
          <label>
            Texto do botão do bloco {n}
            <input
              maxLength={60}
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
            />
          </label>
          <label>
            Link do botão do bloco {n}
            <input
              type="url"
              placeholder="https://"
              value={block.href}
              onChange={(e) => onChange({ ...block, href: e.target.value })}
            />
          </label>
        </>
      );
    case 'coupon':
      return <CouponFields n={n} block={block} onChange={onChange} />;
  }
}

'use client';
import { useState } from 'react';
import {
  CRM_LIMITS,
  type AdminMarketingCampaign,
  type MarketingBlockInput,
} from '@maos-em-oracao/contracts';
import { BlockFields } from './block-fields';
import { Button } from '@/components/ui/button';
import { IS_DEMO } from '@/lib/api/config';

/** A block in the form; fields may still be empty until the campaign is saved. */
export type BlockDraft = { key: string } & (
  | { type: 'text'; style: 'heading' | 'paragraph'; text: string }
  | { type: 'image'; assetId: string; alt: string; href: string; source?: string }
  | { type: 'products'; productIds: string[] }
  | { type: 'button'; label: string; href: string }
  | { type: 'coupon'; code: string; text: string }
);
export type BlockKind = 'heading' | 'paragraph' | 'image' | 'products' | 'button' | 'coupon';

const KIND_LABELS: Record<BlockKind, string> = {
  paragraph: 'Texto',
  heading: 'Título',
  image: 'Imagem',
  products: 'Produtos',
  button: 'Botão',
  coupon: 'Cupom',
};
const KINDS = Object.keys(KIND_LABELS) as BlockKind[];
const DEFAULT_COUPON_TEXT = 'Use o cupom na finalização da compra.';
let sequence = 0;
const nextKey = () => `block-${++sequence}`;

export function newBlock(kind: BlockKind): BlockDraft {
  const key = nextKey();
  switch (kind) {
    case 'heading':
    case 'paragraph':
      return { key, type: 'text', style: kind, text: '' };
    case 'image':
      return { key, type: 'image', assetId: '', alt: '', href: '' };
    case 'products':
      return { key, type: 'products', productIds: [] };
    case 'button':
      return { key, type: 'button', label: '', href: '' };
    case 'coupon':
      return { key, type: 'coupon', code: '', text: DEFAULT_COUPON_TEXT };
  }
}

export function draftsFromCampaign(blocks: AdminMarketingCampaign['blocks']): BlockDraft[] {
  return blocks.map((block): BlockDraft => {
    const key = nextKey();
    if (block.type === 'image')
      return {
        key,
        type: 'image',
        assetId: block.assetId,
        alt: block.alt,
        href: block.href ?? '',
        source: IS_DEMO ? `asset:${block.assetId}` : undefined,
      };
    return { key, ...block };
  });
}

export function blocksToInput(blocks: BlockDraft[]): MarketingBlockInput[] {
  return blocks.map((block): MarketingBlockInput => {
    switch (block.type) {
      case 'text':
        return { type: 'text', style: block.style, text: block.text.trim() };
      case 'image': {
        const href = block.href.trim();
        return { type: 'image', assetId: block.assetId, alt: block.alt, ...(href ? { href } : {}) };
      }
      case 'products':
        return { type: 'products', productIds: block.productIds };
      case 'button':
        return { type: 'button', label: block.label.trim(), href: block.href.trim() };
      case 'coupon':
        return { type: 'coupon', code: block.code.trim().toUpperCase(), text: block.text };
    }
  });
}

/** Plain-language message for the first block that cannot be saved yet. */
export function blockProblem(blocks: BlockDraft[]): string | null {
  for (const [index, block] of blocks.entries()) {
    const n = index + 1;
    if (block.type === 'text' && !block.text.trim()) return `Escreva o texto do bloco ${n}.`;
    if (block.type === 'image' && !block.assetId) return `Envie a imagem do bloco ${n}.`;
    if (block.type === 'products' && !block.productIds.length)
      return `Escolha ao menos um produto no bloco ${n}.`;
    if (block.type === 'button' && (!block.label.trim() || !block.href.trim()))
      return `Preencha o texto e o link do botão do bloco ${n}.`;
    if (block.type === 'coupon' && !block.code.trim()) return `Informe o cupom do bloco ${n}.`;
  }
  return null;
}

const moved = <T,>(list: T[], index: number, delta: -1 | 1) => {
  const next = [...list];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
};

const blockTitle = (block: BlockDraft) =>
  block.type === 'text' ? KIND_LABELS[block.style] : KIND_LABELS[block.type];

export function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: BlockDraft[];
  onChange: (blocks: BlockDraft[]) => void;
}) {
  const [kind, setKind] = useState<BlockKind>('paragraph'),
    full = blocks.length >= CRM_LIMITS.blocks;
  return (
    <fieldset className="stack">
      <legend>Conteúdo do e-mail</legend>
      {blocks.map((block, index) => (
        <div className="stack" key={block.key}>
          <div className="row wrap">
            <strong>
              {index + 1}. {blockTitle(block)}
            </strong>
            <Button
              type="button"
              variant="text"
              className="small"
              aria-label={`Subir bloco ${index + 1}`}
              disabled={index === 0}
              onClick={() => onChange(moved(blocks, index, -1))}
            >
              Subir
            </Button>
            <Button
              type="button"
              variant="text"
              className="small"
              aria-label={`Descer bloco ${index + 1}`}
              disabled={index === blocks.length - 1}
              onClick={() => onChange(moved(blocks, index, 1))}
            >
              Descer
            </Button>
            <Button
              type="button"
              variant="text"
              className="small danger-text"
              aria-label={`Remover bloco ${index + 1}`}
              onClick={() => onChange(blocks.filter((b) => b.key !== block.key))}
            >
              Remover
            </Button>
          </div>
          <BlockFields
            n={index + 1}
            block={block}
            onChange={(next) => onChange(blocks.map((b) => (b.key === block.key ? next : b)))}
          />
        </div>
      ))}
      <div className="row wrap">
        <label>
          Tipo do bloco
          <select value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={full}
          onClick={() => onChange([...blocks, newBlock(kind)])}
        >
          Adicionar bloco
        </Button>
        <small>
          {blocks.length}/{CRM_LIMITS.blocks} blocos
        </small>
      </div>
    </fieldset>
  );
}

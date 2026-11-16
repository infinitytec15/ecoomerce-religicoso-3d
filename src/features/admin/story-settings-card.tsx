'use client';
import { useState } from 'react';
import {
  PRODUCT_PAGE_POSITIONS,
  type ProductPagePosition,
  type StorySettings,
} from '@maos-em-oracao/contracts';
import { useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

const positionLabels: Record<ProductPagePosition, string> = {
  right: 'Direita',
  left: 'Esquerda',
};

/** "Página do produto": the floating video bubble on the pages of pieces that have videos. */
export function ProductPageSettings({ settings }: { settings: StorySettings }) {
  const action = useAdminAction(),
    [enabled, setEnabled] = useState(settings.productPage.enabled),
    [position, setPosition] = useState<ProductPagePosition>(settings.productPage.position);
  return (
    <section className="admin-panel stack" aria-labelledby="story-product-page">
      <div className="admin-panel-heading">
        <div>
          <h2 id="story-product-page">Página do produto</h2>
          <p>
            Uma bolinha flutuante com os vídeos da peça aberta, de qualquer destaque, mesmo os sem
            lugar na loja.
          </p>
        </div>
      </div>
      <Form
        className="stack admin-form"
        onSubmit={async () => {
          await action.run(
            { type: 'story.settings', productPage: { enabled, position } },
            'Página do produto atualizada.',
          );
        }}
      >
        {(pending) => (
          <>
            <label className="row">
              <input
                type="checkbox"
                role="switch"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Mostrar bolinha de vídeo na página do produto
            </label>
            <fieldset className="stack" disabled={!enabled}>
              <legend>Posição da bolinha</legend>
              <div className="row wrap">
                {PRODUCT_PAGE_POSITIONS.map((p) => (
                  <label className="row" key={p}>
                    <input
                      type="radio"
                      name="story-product-page-position"
                      checked={position === p}
                      onChange={() => setPosition(p)}
                    />
                    {positionLabels[p]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="row wrap">
              <Button loading={pending}>Salvar página do produto</Button>
            </div>
          </>
        )}
      </Form>
    </section>
  );
}

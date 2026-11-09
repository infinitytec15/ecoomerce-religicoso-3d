'use client';
import { useState } from 'react';
import type { InventoryProduct } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { useAdminAction } from './shared';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Form, text, number } from '@/components/ui/form';
import { dateLabel } from '@/lib/domain/format';
export function StockControl({ product: p }: { product: InventoryProduct }) {
  const [open, setOpen] = useState(false),
    [archive, setArchive] = useState(false),
    action = useAdminAction(),
    data = useAdminData();
  return (
    <>
      <div className="row wrap">
        <Button variant="text" onClick={() => setOpen(true)}>
          Movimentar
        </Button>
        {!p.archived && (
          <Button variant="text" onClick={() => setArchive(true)}>
            Arquivar
          </Button>
        )}
      </div>
      <Modal open={open} onOpenChange={setOpen} title={'Estoque · ' + p.name}>
        <p>
          Saldo atual: <strong>{p.stock} unidades</strong>
        </p>
        <Form
          onSubmit={async (d) => {
            await action.run({
              type: 'stock.adjust',
              productId: p.id,
              delta: number(d, 'delta'),
              reason: text(d, 'reason'),
            });
          }}
        >
          {(pending) => (
            <>
              <label>
                Entrada ou saída
                <input
                  name="delta"
                  type="number"
                  required
                  min={-p.stock}
                  step={1}
                  placeholder="Ex.: 5 para entrada ou -2 para saída"
                />
              </label>
              <label>
                Motivo
                <textarea name="reason" required minLength={5} maxLength={500} />
              </label>
              <Button loading={pending}>Registrar movimentação</Button>
            </>
          )}
        </Form>
        <h3 style={{ marginTop: 24 }}>Histórico deste produto</h3>
        {data.stockMovements
          .filter((m) => m.productId === p.id)
          .map((m) => (
            <div className="money-line" key={m.id}>
              <span>
                {dateLabel(m.date)} · {m.reason}
                <small>{m.actor}</small>
              </span>
              <strong>
                {m.delta > 0 ? '+' : ''}
                {m.delta}
              </strong>
            </div>
          ))}
        {!data.stockMovements.some((m) => m.productId === p.id) && (
          <p>Ainda não há ajustes registrados.</p>
        )}
      </Modal>
      <Modal open={archive} onOpenChange={setArchive} title="Arquivar produto">
        <p>“{p.name}” será removido da vitrine. Pedidos e histórico permanecem disponíveis.</p>
        <Button
          onClick={async () => {
            await action.run({ type: 'product.archive', id: p.id });
            setArchive(false);
          }}
          loading={action.pending}
        >
          Arquivar produto
        </Button>
      </Modal>
    </>
  );
}

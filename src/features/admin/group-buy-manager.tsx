'use client';
import { useState } from 'react';
import {
  GROUP_BUY_MODES,
  defaultCalculatorSettings,
  groupBuyModeLabels,
  kitMargin,
  unitCostCents,
  unitPriceCents,
  type AdminGroupBuy,
  type GroupBuyMode,
} from '@maos-em-oracao/contracts';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminMetrics, useAdminAction } from './shared';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Form } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { centsFromInput, money } from '@/lib/domain/format';
import type { InventoryProduct } from '@/lib/domain/types';

const isOpen = (gb: AdminGroupBuy) => gb.status === 'Aberta' || gb.status === 'Meta atingida';
const pad = (n: number) => String(n).padStart(2, '0');
const dateTimeLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'A definir';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** ISO instant -> value of an `<input type="datetime-local">` (browser local time). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toPriceInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const safeCents = (value: string) => {
  const n = centsFromInput(value.trim());
  return Number.isFinite(n) ? n : 0;
};
const unlimited = (gb: AdminGroupBuy) => gb.maxParticipants === null;

export function GroupBuyManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    groupBuys: AdminGroupBuy[] = data.groupBuys ?? [],
    [editing, setEditing] = useState<string | null>(null),
    [participantsId, setParticipantsId] = useState<string | null>(null),
    [extendId, setExtendId] = useState<string | null>(null),
    [closeId, setCloseId] = useState<string | null>(null),
    open = groupBuys.filter(isOpen),
    editingGroup = groupBuys.find((g) => g.id === editing),
    participantsGroup = groupBuys.find((g) => g.id === participantsId),
    extendGroup = groupBuys.find((g) => g.id === extendId),
    closeGroup = groupBuys.find((g) => g.id === closeId);
  return (
    <>
      <AdminHeading
        title="Compra coletiva"
        description="Campanhas em que o preço cai quando o grupo fecha a meta de participantes."
        actions={
          <Button type="button" onClick={() => setEditing('new')}>
            Nova campanha
          </Button>
        }
      />
      <AdminMetrics
        items={[
          { label: 'Abertas', value: open.length, note: 'Campanhas recebendo pedidos' },
          {
            label: 'Meta atingida',
            value: groupBuys.filter((g) => g.status === 'Meta atingida').length,
            note: 'Ainda abertas, com a meta batida',
          },
          {
            label: 'Participantes',
            value: open.reduce((sum, g) => sum + g.participants, 0),
            note: 'Soma das campanhas abertas',
          },
          {
            label: 'Devolvido',
            value: money(groupBuys.reduce((sum, g) => sum + g.refundedCents, 0)),
            note: 'Estornos e diferenças devolvidas',
          },
        ]}
      />
      <DataTable
        caption="Campanhas de compra coletiva"
        rows={groupBuys}
        columns={[
          { key: 'title', label: 'Campanha', render: (g) => g.title },
          {
            key: 'product',
            label: 'Produto · tamanho',
            render: (g) => `${g.productName} · ${g.size}`,
          },
          { key: 'mode', label: 'Modo', render: (g) => groupBuyModeLabels[g.mode] },
          { key: 'progress', label: 'Progresso', render: (g) => `${g.participants}/${g.goal}` },
          { key: 'ends', label: 'Prazo', render: (g) => dateTimeLabel(g.endsAt) },
          { key: 'status', label: 'Status', render: (g) => <StatusBadge status={g.status} /> },
          {
            key: 'actions',
            label: 'Ações',
            render: (g) => (
              <div className="row wrap">
                <Button
                  type="button"
                  variant="text"
                  className="small"
                  aria-label={`Editar ${g.title}`}
                  onClick={() => setEditing(g.id)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="text"
                  className="small"
                  aria-label={`Participantes de ${g.title}`}
                  onClick={() => setParticipantsId(g.id)}
                >
                  Participantes
                </Button>
                {isOpen(g) && (
                  <>
                    <Button
                      type="button"
                      variant="text"
                      className="small"
                      aria-label={`Prorrogar ${g.title}`}
                      onClick={() => setExtendId(g.id)}
                    >
                      Prorrogar
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      className="small danger-text"
                      aria-label={`Encerrar ${g.title} agora`}
                      onClick={() => setCloseId(g.id)}
                    >
                      Encerrar agora
                    </Button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={editing !== null && (editing === 'new' || !!editingGroup)}
        onOpenChange={(next) => !next && setEditing(null)}
        title={editingGroup ? 'Editar campanha' : 'Nova campanha'}
        className="admin-record-drawer"
      >
        {editing !== null && (
          <GroupBuyEditor
            key={editing}
            group={editingGroup}
            products={data.products ?? []}
            settings={data.workspace?.costCalculator ?? defaultCalculatorSettings}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal
        open={!!participantsGroup}
        onOpenChange={(next) => !next && setParticipantsId(null)}
        title="Participantes"
        className="admin-record-drawer"
      >
        {participantsGroup && <ParticipantsTable group={participantsGroup} />}
      </Modal>
      <Modal
        open={!!extendGroup}
        onOpenChange={(next) => !next && setExtendId(null)}
        title="Prorrogar campanha"
      >
        {extendGroup && (
          <Form
            onSubmit={async (d) => {
              const endsAt = fromLocalInput(String(d.get('endsAt') ?? ''));
              if (!endsAt) throw new Error('Informe a nova data de encerramento.');
              await action.run(
                { type: 'groupbuy.extend', id: extendGroup.id, endsAt },
                'Prazo prorrogado.',
              );
              setExtendId(null);
            }}
          >
            {(pending) => (
              <>
                <p>
                  {extendGroup.title} termina em {dateTimeLabel(extendGroup.endsAt)}.
                </p>
                <label>
                  Novo prazo
                  <input
                    type="datetime-local"
                    name="endsAt"
                    required
                    defaultValue={toLocalInput(extendGroup.endsAt)}
                  />
                </label>
                <Button loading={pending}>Prorrogar</Button>
              </>
            )}
          </Form>
        )}
      </Modal>
      <Modal
        open={!!closeGroup}
        onOpenChange={(next) => !next && setCloseId(null)}
        title="Encerrar campanha"
      >
        {closeGroup && (
          <Form
            onSubmit={async () => {
              await action.run(
                { type: 'groupbuy.close', id: closeGroup.id },
                'Campanha encerrada.',
              );
              setCloseId(null);
            }}
          >
            {(pending) => (
              <>
                <p>
                  Encerrar agora? Sem a meta, os pedidos do modo &apos;Estorno se não fechar&apos;
                  serão cancelados e estornados.
                </p>
                <div className="row wrap">
                  <Button type="button" variant="secondary" onClick={() => setCloseId(null)}>
                    Voltar
                  </Button>
                  <Button loading={pending}>Encerrar agora</Button>
                </div>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

function ParticipantsTable({ group }: { group: AdminGroupBuy }) {
  return (
    <div className="stack">
      <p>
        {group.title} · {group.participants}/{group.goal} participantes
      </p>
      <div className="admin-table-wrap" tabIndex={0} aria-label="Participantes da campanha">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Pedido</th>
              <th scope="col">Cliente</th>
              <th scope="col">Qtd</th>
              <th scope="col">Pago por unidade</th>
              <th scope="col">Status</th>
              <th scope="col">Estorno</th>
            </tr>
          </thead>
          <tbody>
            {group.orders.length ? (
              group.orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.number}</td>
                  <td>
                    {o.customerName}
                    <br />
                    <small>{o.email}</small>
                  </td>
                  <td>{o.quantity}</td>
                  <td>{money(o.paidUnitCents)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>{o.refund ? `${money(o.refund.amountCents)} · ${o.refund.status}` : '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>Ainda não há pedidos nesta campanha.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupBuyEditor({
  group,
  products,
  settings,
  onDone,
}: {
  group?: AdminGroupBuy;
  products: InventoryProduct[];
  settings: typeof defaultCalculatorSettings;
  onDone: () => void;
}) {
  const action = useAdminAction(),
    locked = !!group?.locked,
    choices = products.filter((p) => !p.archived || p.id === group?.productId),
    [title, setTitle] = useState(group?.title ?? ''),
    [description, setDescription] = useState(group?.description ?? ''),
    [productId, setProductId] = useState(group?.productId ?? choices[0]?.id ?? ''),
    [sizeIndex, setSizeIndex] = useState(group?.sizeIndex ?? 0),
    [price, setPrice] = useState(group ? toPriceInput(group.groupPriceCents) : ''),
    [goal, setGoal] = useState(String(group?.goal ?? 10)),
    [maxParticipants, setMaxParticipants] = useState(
      group && !unlimited(group) ? String(group.maxParticipants) : '',
    ),
    [perPersonLimit, setPerPersonLimit] = useState(String(group?.perPersonLimit ?? 2)),
    [mode, setMode] = useState<GroupBuyMode>(group?.mode ?? 'difference'),
    [startsAt, setStartsAt] = useState(group ? toLocalInput(group.startsAt) : ''),
    [endsAt, setEndsAt] = useState(() =>
      toLocalInput(group?.endsAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString()),
    ),
    [active, setActive] = useState(group?.active ?? true),
    product = products.find((p) => p.id === productId),
    sizes = product?.sizes ?? [],
    priceCents = safeCents(price),
    normalCents = product ? unitPriceCents(product, sizeIndex) : 0,
    margin =
      product && priceCents > 0
        ? kitMargin({ priceCents, costCents: unitCostCents(product, sizeIndex) }, settings)
        : null,
    minimum = settings.minMarginPct ?? 20;
  return (
    <Form
      onSubmit={async () => {
        const endsAtIso = locked ? group!.endsAt : fromLocalInput(endsAt),
          startsAtIso = locked ? group!.startsAt : startsAt ? fromLocalInput(startsAt) : null;
        if (!endsAtIso) throw new Error('Informe o prazo da campanha.');
        await action.run(
          {
            type: 'groupbuy.save',
            ...(group ? { id: group.id } : {}),
            title: title.trim(),
            description: description.trim(),
            productId,
            sizeIndex,
            groupPriceCents: priceCents,
            goal: Number(goal),
            maxParticipants: maxParticipants.trim() ? Number(maxParticipants) : null,
            perPersonLimit: Number(perPersonLimit),
            mode,
            ...(startsAtIso ? { startsAt: startsAtIso } : {}),
            endsAt: endsAtIso,
            active,
          },
          group ? 'Campanha atualizada.' : 'Campanha criada.',
        );
        onDone();
      }}
    >
      {(pending) => (
        <>
          {locked && (
            <p className="notice">
              Já há pedidos nesta campanha: produto, tamanho, preço, meta, modo e datas não mudam
              mais.
            </p>
          )}
          <label>
            Título
            <input
              required
              minLength={3}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Descrição
            <textarea
              maxLength={600}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Produto
            <select
              required
              disabled={locked}
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setSizeIndex(0);
              }}
            >
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tamanho
            <select
              disabled={locked}
              value={sizeIndex}
              onChange={(e) => setSizeIndex(Number(e.target.value))}
            >
              {sizes.map((size, i) => (
                <option key={size + i} value={i}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preço de grupo (R$)
            <input
              required
              inputMode="decimal"
              disabled={locked}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          {product && <p className="muted">Preço normal deste tamanho: {money(normalCents)}.</p>}
          {margin?.loss && product && (
            <p className="form-error" role="alert">
              Preço de grupo abaixo do custo ({money(unitCostCents(product, sizeIndex))}).
            </p>
          )}
          {margin && !margin.loss && margin.belowMinimum && (
            <p className="form-error" role="alert">
              Margem abaixo da mínima de {minimum}%.
            </p>
          )}
          <label>
            Meta de participantes
            <input
              required
              type="number"
              min={2}
              max={1000}
              disabled={locked}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </label>
          <label>
            Limite de participantes
            <input
              type="number"
              min={2}
              max={5000}
              placeholder="Sem limite"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </label>
          <label>
            Limite por pessoa
            <input
              required
              type="number"
              min={1}
              max={10}
              value={perPersonLimit}
              onChange={(e) => setPerPersonLimit(e.target.value)}
            />
          </label>
          <label>
            Modo
            <select
              disabled={locked}
              value={mode}
              onChange={(e) => setMode(e.target.value as GroupBuyMode)}
            >
              {GROUP_BUY_MODES.map((m) => (
                <option key={m} value={m}>
                  {groupBuyModeLabels[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              type="datetime-local"
              disabled={locked}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label>
            Prazo
            <input
              required
              type="datetime-local"
              disabled={locked}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
          <label className="row">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa
          </label>
          <Button loading={pending}>Salvar campanha</Button>
        </>
      )}
    </Form>
  );
}

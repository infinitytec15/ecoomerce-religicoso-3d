'use client';
import { IS_DEMO } from '@/lib/api/config';
import { useAdminOverview } from './server-data';
import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useAdminData } from './admin-frame';
import { money, today } from '@/lib/domain/format';
import { RecordButton } from './record-drawer';
export function AdminAnalytics({ finance = false }: { finance?: boolean }) {
  const data = useAdminData(),
    [period, setPeriod] = useState('30'),
    [origin, setOrigin] = useState('Todos'),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(today());
  const [clock] = useState(() => Date.now());
  const since =
      period === 'custom'
        ? start || today()
        : period === 'all'
          ? '0000-01-01'
          : new Date(clock - Number(period) * 86400000).toISOString().slice(0, 10),
    until = period === 'custom' ? end : today();
  const totals = useAdminOverview({
    from: (since === '0000-01-01' ? '2000-01-01' : since) + 'T00:00:00-03:00',
    to: until + 'T23:59:59.999-03:00',
    ...(origin !== 'Todos' ? { origin } : {}),
  });
  const orders = data.orders.filter((o) => origin === 'Todos' || o.type === origin),
    ids = new Set(orders.map((o) => o.id));
  const charges = data.charges.filter(
      (c) =>
        ids.has(c.orderId) &&
        (c.paidAt || c.due).slice(0, 10) >= since &&
        (c.paidAt || c.due).slice(0, 10) <= until,
    ),
    expenses = data.expenses.filter((e) => e.date >= since && e.date <= until);
  const localSeries = useMemo(() => {
    const days = new Map<
      string,
      { date: string; receita: number; despesas: number; pedidos: number }
    >();
    const get = (date: string) => {
      const key = date.slice(0, 10);
      if (!days.has(key)) days.set(key, { date: key, receita: 0, despesas: 0, pedidos: 0 });
      return days.get(key)!;
    };
    for (const c of data.charges) {
      const date = (c.paidAt || c.due).slice(0, 10);
      const o = data.orders.find((o) => o.id === c.orderId);
      if (
        date >= since &&
        date <= until &&
        (origin === 'Todos' || o?.type === origin) &&
        c.status === 'Pago'
      )
        get(date).receita += c.amountCents / 100;
    }
    for (const e of data.expenses)
      if (e.date >= since && e.date <= until && e.status === 'Pago')
        get(e.date).despesas += e.amountCents / 100;
    for (const o of data.orders)
      if (
        o.created.slice(0, 10) >= since &&
        o.created.slice(0, 10) <= until &&
        (origin === 'Todos' || o.type === origin)
      )
        get(o.created).pedidos++;
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data, since, until, origin]);
  const series = IS_DEMO
    ? localSeries
    : (totals.data?.daily || []).map((d) => ({
        date: d.date,
        receita: d.income / 100,
        despesas: d.expense / 100,
        pedidos: d.orders,
      }));
  const received = !IS_DEMO
      ? totals.data?.grossCents || 0
      : charges.filter((c) => c.status === 'Pago').reduce((sum, c) => sum + c.amountCents, 0),
    paidExpenses = !IS_DEMO
      ? (totals.data?.expensesCents || 0) + (totals.data?.refundsCents || 0)
      : expenses.filter((e) => e.status === 'Pago').reduce((sum, e) => sum + e.amountCents, 0),
    paid = IS_DEMO
      ? charges.filter((c) => c.status === 'Pago').length
      : totals.data?.paidCount || 0,
    distribution = ['card', 'pix', 'split'].map((method) => ({
      method: method === 'card' ? 'Cartão' : method === 'pix' ? 'Pix' : 'Pix + cartão',
      total: !IS_DEMO
        ? (totals.data?.distribution.find((d) => d.method === method)?.cents || 0) / 100
        : charges
            .filter((c) => c.method === method && c.status === 'Pago')
            .reduce((sum, c) => sum + c.amountCents / 100, 0),
    }));
  return (
    <section className="admin-analytics" aria-label="Análise da operação">
      {!IS_DEMO && totals.error && (
        <p className="form-error" role="alert">
          {totals.error.message}
        </p>
      )}
      <div className="analytics-heading">
        <div>
          <h2>{finance ? 'Movimentação financeira' : 'A loja em movimento'}</h2>
          <p>
            Recebimentos confirmados{' '}
            {origin === 'Todos' ? 'da loja e do clube' : origin === 'Loja' ? 'da loja' : 'do clube'}{' '}
            no período.
          </p>
        </div>
        <div className="analytics-filters">
          <label className="sr-only" htmlFor={'period-' + finance}>
            Período dos gráficos
          </label>
          <select
            id={'period-' + finance}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todo o histórico</option>
            <option value="custom">Personalizado</option>
          </select>
          <select
            aria-label="Origem dos gráficos"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option>Todos</option>
            <option>Loja</option>
            <option>Clube</option>
          </select>
        </div>
      </div>
      {period === 'custom' && (
        <div className="row wrap analytics-custom">
          <label>
            De
            <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
      )}
      <div className="analytics-layout">
        <div className="revenue-chart">
          <div className="revenue-total">
            <strong>{money(received)}</strong>
            <span>
              {paid} pagamentos confirmados{finance ? ' · saídas ' + money(paidExpenses) : ''}
            </span>
          </div>
          {finance && (
            <div className="chart-legend" aria-label="Legenda do gráfico financeiro">
              <span>Valores em reais (R$)</span>
              <span>
                <i className="legend-line" aria-hidden="true" />
                Recebimentos
              </span>
              <span>
                <i className="legend-line outgoing" aria-hidden="true" />
                Despesas
              </span>
            </div>
          )}
          {series.length ? (
            <div
              className="chart-frame"
              role="img"
              aria-label="Evolução de recebimentos e despesas em reais. Os valores também estão na tabela abaixo."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={series}
                  margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid stroke="#dfe4d7" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => String(d).slice(5).split('-').reverse().join('/')}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={32}
                    tick={{ fill: '#65695f', fontSize: 12 }}
                  />
                  <YAxis
                    width={55}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + ' mil' : String(v)
                    }
                    tick={{ fill: '#65695f', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    labelFormatter={(d) => String(d).split('-').reverse().join('/')}
                    contentStyle={{ borderRadius: 12, border: '1px solid #dfe4d7' }}
                  />
                  <Area
                    name="Recebimentos"
                    dataKey="receita"
                    stroke="#4f683b"
                    fill="#e5ecd9"
                    strokeWidth={2.5}
                    isAnimationActive={false}
                  />
                  {finance && (
                    <Area
                      name="Despesas"
                      strokeDasharray="5 4"
                      dataKey="despesas"
                      stroke="#aa5438"
                      fill="#f4e8de"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">Ainda não há movimentação neste período.</div>
          )}
          <details className="chart-data">
            <summary>Ver dados do gráfico</summary>
            <table>
              <caption>Valores diários registrados, em reais</caption>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Recebimentos</th>
                  <th>Despesas</th>
                  <th>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {series.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{money(d.receita * 100)}</td>
                    <td>{money(d.despesas * 100)}</td>
                    <td>{d.pedidos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
        <aside className="revenue-breakdown">
          <h3>{finance ? 'Como o dinheiro entrou' : 'Da escolha à entrega'}</h3>
          {finance ? (
            <>
              <div className="method-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distribution}
                    layout="vertical"
                    margin={{ left: 0, right: 12 }}
                    accessibilityLayer
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="method"
                      width={83}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#282c25', fontSize: 12 }}
                    />
                    <Tooltip formatter={(v) => money(Number(v) * 100)} />
                    <Bar
                      name="Recebido"
                      dataKey="total"
                      fill="#687e50"
                      radius={[0, 5, 5, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {distribution.map((d) => (
                <div className="money-line" key={d.method}>
                  <span>{d.method}</span>
                  <strong>{money(d.total * 100)}</strong>
                </div>
              ))}
              <div className="analytics-net">
                <span>Saldo do período</span>
                <strong>{money(received - paidExpenses)}</strong>
              </div>
            </>
          ) : (
            <>
              {[
                ['Aguardando pagamento', 'Pagamento'],
                ['Aguardando grupo', 'Aguardando grupo'],
                ['Confirmado', 'Confirmados'],
                ['Em produção', 'Em produção'],
                ['Em acabamento', 'Acabamento'],
                ['Pronto para envio', 'Prontos para envio'],
                ['Enviado', 'A caminho'],
              ].map(([status, label]) => {
                const records = orders.filter((o) => o.status === status);
                return (
                  <div className="pipeline-row" key={status}>
                    <div>
                      <span>{label}</span>
                      <strong>
                        {IS_DEMO
                          ? records.length
                          : totals.data?.pipeline.find((p) => p.status === status)?.count || 0}
                      </strong>
                    </div>
                    <div className="pipeline-track">
                      <span
                        style={{
                          width:
                            Math.max(0, (records.length / Math.max(1, orders.length)) * 100) + '%',
                        }}
                      />
                    </div>
                    {records[0] && (
                      <RecordButton record={{ kind: 'order', id: records[0].id }}>
                        Abrir próximo pedido →
                      </RecordButton>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

'use client';
import { useState } from 'react';
import { useAdminData } from './admin-frame';
import { AdminHeading, useAdminAction } from './shared';
import { Form, text, number } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { centsFromInput } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
import type { WorkspaceSettings } from '@/lib/domain/types';
const groups = [
  'Loja e contato',
  'Produção e estoque',
  'Frete e expedição',
  'Pagamentos e clube',
  'Mídia e arquivos',
  'Comunidade e oração',
  'Notificações',
];
export function WorkspaceSettingsPanel() {
  const data = useAdminData(),
    action = useAdminAction(),
    [tab, setTab] = useState(0),
    w = data.workspace;
  const field = (key: keyof WorkspaceSettings, label: string, type = 'text', minimum?: number) => (
    <label key={key}>
      {label}
      <input
        name={key}
        type={type}
        required={key !== 'document' && key !== 'lowStockEmails'}
        min={minimum}
        defaultValue={String(w[key])}
      />
    </label>
  );
  const toggle = (key: keyof WorkspaceSettings, label: string) => (
    <label className="setting-toggle" key={key}>
      <span>{label}</span>
      <input type="checkbox" name={key} defaultChecked={Boolean(w[key])} />
    </label>
  );
  return (
    <>
      <AdminHeading
        title="Configurações"
        description="A base de uma operação bem cuidada. Organize a loja, a produção e cada integração."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Áreas de configuração">
          {groups.map((g, i) => (
            <button type="button" key={g} aria-pressed={tab === i} onClick={() => setTab(i)}>
              {g}
            </button>
          ))}
        </nav>
        <section className="admin-panel">
          <Form
            onInvalid={(event) => {
              const target = event.target as HTMLElement,
                panel = target.closest('[data-settings-tab]');
              if (panel) {
                setTab(Number(panel.getAttribute('data-settings-tab')));
                requestAnimationFrame(() => target.focus());
              }
            }}
            onSubmit={async (d) => {
              const settings = { ...w };
              for (const key of [
                'legalName',
                'document',
                'supportHours',
                'originCep',
                'originStreet',
                'originNumber',
                'originDistrict',
                'originCity',
                'originState',
                'contactName',
                'privacyEmail',
                'returnInstructions',
                'storeDescription',
                'prayerSenderName',
                'prayerReplyTo',
                'prayerSendHour',
                'lowStockEmails',
              ] as const)
                settings[key] = text(d, key);
              for (const key of [
                'responseHours',
                'defaultWeightGrams',
                'defaultWidthCm',
                'defaultHeightCm',
                'defaultLengthCm',
                'productionDays',
              ] as const)
                settings[key] = number(d, key);
              for (const key of [
                'reviewPrayers',
                'youtubeEnabled',
                'notificationOrder',
                'notificationLowStock',
                'notificationTicket',
              ] as const)
                settings[key] = d.has(key);
              settings.freeShippingAboveCents = centsFromInput(text(d, 'freeShipping'));
              settings.inventoryPolicy = text(
                d,
                'inventoryPolicy',
              ) as WorkspaceSettings['inventoryPolicy'];
              settings.ticketReplies = text(d, 'ticketReplies')
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean);
              await action.run({ type: 'workspace.save', settings });
              await action.run({
                type: 'settings.save',
                settings: {
                  ...data.settings,
                  storeName: text(d, 'storeName'),
                  email: text(d, 'email'),
                  phone: text(d, 'phone'),
                  clubName: text(d, 'clubName'),
                  priceCents: centsFromInput(text(d, 'clubPrice')),
                  dispatchDay: number(d, 'dispatchDay'),
                  lowStock: number(d, 'lowStock'),
                },
              });
            }}
          >
            {(pending) => (
              <>
                <div data-settings-tab={0} hidden={tab !== 0} className="stack">
                  <h2>Loja e contato</h2>
                  <div className="form-grid">
                    <label>
                      Nome da loja
                      <input name="storeName" defaultValue={data.settings.storeName} required />
                    </label>
                    {field('legalName', 'Razão social / nome completo')}
                    {field('document', 'CPF ou CNPJ')}
                    {field('contactName', 'Responsável pelo contato')}
                    <label>
                      E-mail público
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={data.settings.email}
                      />
                    </label>
                    <label>
                      Telefone
                      <input name="phone" defaultValue={data.settings.phone} />
                    </label>
                    {field('supportHours', 'Horário do atendimento')}
                    {field('responseHours', 'Prazo de resposta (horas)', 'number', 1)}
                    {field('privacyEmail', 'Contato de privacidade', 'email')}
                  </div>
                  <label>
                    Sobre a loja
                    <textarea
                      name="storeDescription"
                      minLength={10}
                      required
                      defaultValue={w.storeDescription}
                    />
                  </label>
                  <label>
                    Orientação para devoluções
                    <textarea
                      name="returnInstructions"
                      minLength={10}
                      required
                      defaultValue={w.returnInstructions}
                    />
                  </label>
                </div>
                <div data-settings-tab={1} hidden={tab !== 1} className="stack">
                  <h2>Produção e estoque</h2>
                  <div className="form-grid">
                    {field('productionDays', 'Prazo padrão de produção (dias úteis)', 'number', 0)}
                    <label>
                      Alerta de estoque baixo
                      <input
                        name="lowStock"
                        type="number"
                        min={0}
                        defaultValue={data.settings.lowStock}
                        required
                      />
                    </label>
                    <label>
                      Política de disponibilidade
                      <select name="inventoryPolicy" defaultValue={w.inventoryPolicy}>
                        <option value="on-demand">Produção sob encomenda</option>
                        <option value="stock">Somente estoque disponível</option>
                      </select>
                    </label>
                  </div>
                  <p>Medidas específicas do produto prevalecem sobre os padrões de embalagem.</p>
                </div>
                <div data-settings-tab={2} hidden={tab !== 2} className="stack">
                  <div className="row between">
                    <h2>Frete e expedição</h2>
                    <StatusBadge status={IS_DEMO ? 'Simulado' : 'Não configurado'} />
                  </div>
                  <p>
                    Melhor Envio para cotação, contratação de etiquetas e acompanhamento de
                    entregas.
                  </p>
                  <h3>Endereço de origem</h3>
                  <div className="form-grid">
                    {field('originCep', 'CEP')}
                    {field('originStreet', 'Logradouro')}
                    {field('originNumber', 'Número')}
                    {field('originDistrict', 'Bairro')}
                    {field('originCity', 'Cidade')}
                    {field('originState', 'UF')}
                  </div>
                  <h3>Embalagem padrão</h3>
                  <div className="form-grid">
                    {field('defaultWeightGrams', 'Peso total (g)', 'number', 1)}
                    {field('defaultWidthCm', 'Largura (cm)', 'number', 1)}
                    {field('defaultHeightCm', 'Altura (cm)', 'number', 1)}
                    {field('defaultLengthCm', 'Comprimento (cm)', 'number', 1)}
                    <label>
                      Frete grátis acima de (R$)
                      <input
                        name="freeShipping"
                        type="number"
                        min={0}
                        step=".01"
                        defaultValue={w.freeShippingAboveCents / 100}
                      />
                      <small>Zero mantém a cotação normal. Frete do clube já está incluído.</small>
                    </label>
                  </div>
                  <div className="notice">
                    A conexão OAuth e os tokens do Melhor Envio serão gerenciados no servidor. A
                    cotação preservará serviço, volumes, seguro e validade.
                  </div>
                </div>
                <div data-settings-tab={3} hidden={tab !== 3} className="stack">
                  <div className="row between">
                    <h2>Pagamentos e clube</h2>
                    <StatusBadge status={IS_DEMO ? 'Simulado' : 'Não configurado'} />
                  </div>
                  <p>Mercado Pago · checkout transparente por Pix e cartão.</p>
                  <div className="form-grid">
                    <label className="span2">
                      Nome do clube
                      <input name="clubName" required defaultValue={data.settings.clubName} />
                    </label>
                    <label>
                      Mensalidade para novos contratos (R$)
                      <input
                        name="clubPrice"
                        type="number"
                        min=".01"
                        step=".01"
                        required
                        defaultValue={data.settings.priceCents / 100}
                      />
                    </label>
                    <label>
                      Dia de expedição
                      <input
                        name="dispatchDay"
                        type="number"
                        min={1}
                        max={28}
                        required
                        defaultValue={data.settings.dispatchDay}
                      />
                    </label>
                  </div>
                  <div className="integration-explainer">
                    <h3>Cartão recorrente</h3>
                    <p>
                      Contrato de assinatura no Mercado Pago, com confirmação por webhook a cada
                      ciclo.
                    </p>
                    <h3>Pix mensal</h3>
                    <p>
                      Uma cobrança por mês, confirmada pelo cliente. Não representa débito
                      automático.
                    </p>
                    <h3>Pix + cartão</h3>
                    <p>
                      Duas parcelas de pagamento vinculadas ao mesmo pedido. Produção liberada
                      somente depois da confirmação de ambas.
                    </p>
                  </div>
                  <p className="notice">
                    Contratos existentes preservam o valor da adesão. Credenciais e chaves privadas
                    são configuradas no Railway, nunca neste navegador.
                  </p>
                </div>
                <div data-settings-tab={4} hidden={tab !== 4} className="stack">
                  <h2>Mídia e arquivos</h2>
                  {[
                    [
                      'Bunny Storage',
                      'Imagens e arquivos originais STL/3MF. Originais de fabricação privados.',
                    ],
                    [
                      'Bunny Stream',
                      'Vídeos enviados com upload retomável e processamento acompanhado.',
                    ],
                    [
                      'Visualização 3D',
                      'Disponível somente com STL/3MF válido; a API prepara um GLB otimizado.',
                    ],
                  ].map(([title, description]) => (
                    <section className="integration-row" key={title}>
                      <div>
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                      <StatusBadge status={IS_DEMO ? 'Local' : 'Não configurado'} />
                    </section>
                  ))}
                  {toggle('youtubeEnabled', 'Permitir vídeos externos do YouTube')}
                  <p className="notice">
                    No modo demonstrativo, arquivos ficam neste navegador. Nenhuma chave de Bunny é
                    exposta na interface.
                  </p>
                </div>
                <div data-settings-tab={5} hidden={tab !== 5} className="stack">
                  <h2>Comunidade e oração diária</h2>
                  {toggle('reviewPrayers', 'Revisar novos pedidos antes de publicar no mural')}
                  <div className="form-grid">
                    {field('prayerSenderName', 'Nome de quem envia a oração')}
                    {field('prayerReplyTo', 'E-mail para respostas', 'email')}
                    {field('prayerSendHour', 'Horário preferido (Brasília)', 'time')}
                  </div>
                  <p>
                    Inscrição gratuita com consentimento e cancelamento pelo próprio leitor.
                    Conteúdo de oração não deve ser reutilizado para publicidade sem consentimento
                    separado.
                  </p>
                  <label>
                    Respostas rápidas do atendimento (uma por linha)
                    <textarea
                      name="ticketReplies"
                      rows={5}
                      defaultValue={w.ticketReplies.join('\n')}
                    />
                  </label>
                </div>
                <div data-settings-tab={6} hidden={tab !== 6} className="stack">
                  <h2>Notificações da operação</h2>
                  {toggle('notificationOrder', 'Avisar sobre novos pedidos')}
                  {toggle('notificationLowStock', 'Avisar sobre estoque baixo')}
                  {toggle('notificationTicket', 'Avisar sobre novos atendimentos')}
                  {field('lowStockEmails', 'E-mails adicionais de alerta')}
                  <p className="demo-text">
                    Preferências salvas para integração. Neste modo, nenhum e-mail ou aviso externo
                    é enviado.
                  </p>
                </div>
                <div className="editor-footer">
                  <span>Alterações registradas no histórico</span>
                  <Button loading={pending}>Salvar configurações</Button>
                </div>
              </>
            )}
          </Form>
        </section>
      </div>
    </>
  );
}

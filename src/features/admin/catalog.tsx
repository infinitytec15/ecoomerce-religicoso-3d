'use client';
import { useState } from 'react';
import Image from 'next/image';
import type {
  Collection,
  FaithProfile,
  InventoryProduct,
  StoreSettings,
  TeamMember,
} from '@/lib/domain/types';
import { collections } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminError, exportAdmin, useAdminAction, useAdminFilter } from './shared';
import { Button, ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Form, text, number } from '@/components/ui/form';
import { ProductImage } from '@/components/ui/product-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/ui/data-table';
import { centsFromInput, money, monthLabel, uid } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
const baseImages = [
  'cruz-essencial',
  'nossa-senhora',
  'espirito-santo',
  'palavra-fe',
  'sagrada-familia',
  'biblia-viva',
];
function ProductEditor({
  product: p,
  onSuccess,
}: {
  product?: InventoryProduct;
  onSuccess: () => void;
}) {
  const action = useAdminAction();
  return (
    <Form
      onSubmit={async (d) => {
        const imageIndex = number(d, 'imageIndex');
        await action.run({
          type: 'product.save',
          product: {
            id: p?.id || uid('peca').toLowerCase(),
            name: text(d, 'name'),
            description: text(d, 'description'),
            category: text(d, 'category') as Collection,
            tags: Array.from(
              new Set([
                text(d, 'category') as Collection,
                ...(text(d, 'personalized') === 'yes' ? ['Personalizados' as Collection] : []),
                'Presentes' as Collection,
              ]),
            ),
            priceCents: centsFromInput(text(d, 'price')),
            imageIndex,
            image: `/assets/products/${baseImages[imageIndex]}.webp`,
            badge: p?.badge || 'Nova peça',
            sizes: p?.sizes || ['15 cm', '20 cm', '25 cm'],
            colors: p?.colors || ['Marfim', 'Areia', 'Terracota'],
            active: text(d, 'active') === 'true',
            sku: text(d, 'sku'),
            stock: number(d, 'stock'),
            costCents: centsFromInput(text(d, 'cost')),
          },
        });
        onSuccess();
      }}
    >
      {(pending) => (
        <>
          <div className="form-grid">
            <label>
              Nome da peça
              <input name="name" required minLength={3} defaultValue={p?.name || ''} />
            </label>
            <label>
              Preço (R$)
              <input
                name="price"
                type="number"
                required
                min=".01"
                step=".01"
                defaultValue={p ? p.priceCents / 100 : 89.9}
              />
            </label>
            <label>
              SKU
              <input name="sku" required defaultValue={p?.sku || 'MEO-NOVO'} />
            </label>
            <label>
              Estoque disponível
              <input
                name="stock"
                type="number"
                required
                min={0}
                step={1}
                defaultValue={p?.stock ?? 10}
              />
            </label>
            <label>
              Custo unitário (R$)
              <input
                name="cost"
                type="number"
                required
                min={0}
                step=".01"
                defaultValue={(p?.costCents ?? 2500) / 100}
              />
            </label>
            <label>
              Coleção
              <select name="category" defaultValue={p?.category || 'Cristãos'}>
                {collections.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Imagem conceitual
              <select name="imageIndex" defaultValue={p?.imageIndex || 0}>
                {['Cruz', 'Nossa Senhora', 'Pomba', 'Palavra Fé', 'Sagrada Família', 'Bíblia'].map(
                  (label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Visibilidade
              <select name="active" defaultValue={p?.active === false ? 'false' : 'true'}>
                <option value="true">Publicado no catálogo</option>
                <option value="false">Oculto do catálogo</option>
              </select>
            </label>
            <label>
              Dedicatória
              <select
                name="personalized"
                defaultValue={p?.tags.includes('Personalizados') ? 'yes' : 'no'}
              >
                <option value="no">Sem dedicatória</option>
                <option value="yes">Permitir dedicatória na embalagem</option>
              </select>
            </label>
          </div>
          <label>
            Descrição
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={1000}
              defaultValue={
                p?.description ||
                'Peça decorativa cristã em impressão 3D. Modelo conceitual de demonstração.'
              }
            />
          </label>
          <Button loading={pending}>Salvar produto e estoque</Button>
        </>
      )}
    </Form>
  );
}
export function AdminProducts() {
  const data = useAdminData(),
    [editing, setEditing] = useState<InventoryProduct | 'new' | null>(null),
    filter = useAdminFilter(
      data.products,
      (p) => p.name + ' ' + p.sku + ' ' + p.category,
      (p) => (p.active ? 'Ativo' : 'Inativo'),
      ['Todos', 'Ativo', 'Inativo'],
    );
  return (
    <>
      <AdminHeading
        title="Produtos e estoque"
        description="Preços, disponibilidade e referências usadas pela loja e pelo clube."
        actions={
          <>
            <Button
              variant="secondary"
              className="small"
              onClick={() => exportAdmin(data, 'produtos')}
            >
              Exportar catálogo
            </Button>
            <Button className="small" onClick={() => setEditing('new')}>
              <Icon name="plus" />
              Novo produto
            </Button>
          </>
        }
      />
      {filter.toolbar}
      <DataTable
        rows={filter.rows}
        columns={[
          {
            key: 'name',
            label: 'Produto / SKU',
            render: (p) => (
              <div className="admin-product-cell">
                <ProductImage src={p.image} alt={p.name} sizes="45px" />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.sku}</small>
                </span>
              </div>
            ),
          },
          { key: 'category', label: 'Coleção', render: (p) => p.category },
          { key: 'price', label: 'Preço', render: (p) => money(p.priceCents) },
          {
            key: 'stock',
            label: 'Estoque',
            render: (p) => (
              <span className={p.stock <= data.settings.lowStock ? 'danger-text' : ''}>
                {p.stock} un.
              </span>
            ),
          },
          {
            key: 'active',
            label: 'Disponibilidade',
            render: (p) => <StatusBadge status={p.active ? 'Ativo' : 'Inativo'} />,
          },
          {
            key: 'edit',
            label: '',
            render: (p) => (
              <Button variant="secondary" className="small" onClick={() => setEditing(p)}>
                Editar
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'Novo produto' : 'Editar produto e estoque'}
      >
        {editing && (
          <ProductEditor
            product={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
export function AdminEditions() {
  const data = useAdminData(),
    action = useAdminAction();
  return (
    <>
      <AdminHeading
        title="Edição mensal do clube"
        description="Defina a curadoria, os perfis e o dia de expedição."
      />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <Form
            onSubmit={async (d) => {
              const profiles = Object.fromEntries(
                (['Católica', 'Evangélica', 'Cristã'] as FaithProfile[]).map((profile) => [
                  profile,
                  d.getAll('items-' + profile).map(String),
                ]),
              ) as StoreSettings['profiles'];
              if (Object.values(profiles).some((items) => !items.length))
                throw new Error('Selecione pelo menos uma peça para cada perfil de cesta.');
              await action.run(
                {
                  type: 'settings.save',
                  settings: {
                    ...data.settings,
                    edition: text(d, 'edition'),
                    editionMonth: text(d, 'month'),
                    dispatchDay: number(d, 'dispatchDay'),
                    profiles,
                  },
                },
                'Edição preparada para os próximos ciclos.',
              );
            }}
          >
            {(pending) => (
              <>
                <div className="form-grid">
                  <label>
                    Mês da edição
                    <input
                      name="month"
                      type="month"
                      required
                      defaultValue={data.settings.editionMonth}
                    />
                  </label>
                  <label>
                    Dia previsto de expedição
                    <input
                      name="dispatchDay"
                      type="number"
                      required
                      min={1}
                      max={28}
                      defaultValue={data.settings.dispatchDay}
                    />
                  </label>
                  <label className="span2">
                    Nome da edição
                    <input name="edition" required defaultValue={data.settings.edition} />
                  </label>
                </div>
                {(['Católica', 'Evangélica', 'Cristã'] as const).map((profile) => (
                  <fieldset className="edition-profile" key={profile}>
                    <legend>Cesta {profile.toLowerCase()}</legend>
                    <div>
                      {data.products
                        .filter((p) => p.active)
                        .map((p) => (
                          <label key={p.id}>
                            <input
                              name={'items-' + profile}
                              type="checkbox"
                              value={p.id}
                              defaultChecked={data.settings.profiles[profile].includes(p.id)}
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                ))}
                <div className="notice">
                  A curadoria atualizada é usada nos próximos ciclos. Pedidos já criados mantêm seus
                  itens.
                </div>
                <Button loading={pending}>Salvar edição{IS_DEMO ? ' de demonstração' : ''}</Button>
              </>
            )}
          </Form>
        </section>
        <aside className="admin-panel">
          <div className="admin-edition-image" style={{ position: 'relative' }}>
            <Image
              src="/assets/club-basket.webp"
              alt="Cesta mensal conceitual"
              fill
              sizes="300px"
            />
          </div>
          <h2>{data.settings.edition}</h2>
          <p>
            {monthLabel(data.settings.editionMonth)} · envio previsto no dia{' '}
            {data.settings.dispatchDay}
          </p>
          <div className="money-line">
            <span>Valor do plano</span>
            <strong>{money(data.settings.priceCents)}/mês</strong>
          </div>
          <ButtonLink className="small full" variant="secondary" href="/clube">
            Visualizar página do clube
          </ButtonLink>
        </aside>
      </div>
    </>
  );
}
export function AdminSettings() {
  const data = useAdminData(),
    action = useAdminAction();
  return (
    <>
      <AdminHeading
        title="Configurações"
        description="Ajustes da marca, do plano mensal e da operação."
      />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <Form
            onSubmit={async (d) => {
              await action.run({
                type: 'settings.save',
                settings: {
                  ...data.settings,
                  storeName: text(d, 'storeName'),
                  email: text(d, 'email'),
                  phone: text(d, 'phone'),
                  clubName: text(d, 'clubName'),
                  priceCents: centsFromInput(text(d, 'price')),
                  dispatchDay: number(d, 'dispatchDay'),
                  lowStock: number(d, 'lowStock'),
                },
              });
            }}
          >
            {(pending) => (
              <>
                <h2>Loja e atendimento</h2>
                <div className="form-grid">
                  <label className="span2">
                    Nome da loja
                    <input name="storeName" required defaultValue={data.settings.storeName} />
                  </label>
                  <label>
                    E-mail de atendimento
                    <input name="email" type="email" required defaultValue={data.settings.email} />
                  </label>
                  <label>
                    Telefone
                    <input name="phone" defaultValue={data.settings.phone} />
                  </label>
                </div>
                <h2>Plano mensal único</h2>
                <div className="form-grid">
                  <label className="span2">
                    Nome do clube
                    <input name="clubName" required defaultValue={data.settings.clubName} />
                  </label>
                  <label>
                    Mensalidade para novas assinaturas (R$)
                    <input
                      name="price"
                      type="number"
                      required
                      min=".01"
                      step=".01"
                      defaultValue={data.settings.priceCents / 100}
                    />
                  </label>
                  <label>
                    Dia da expedição mensal
                    <input
                      name="dispatchDay"
                      type="number"
                      required
                      min={1}
                      max={28}
                      defaultValue={data.settings.dispatchDay}
                    />
                  </label>
                  <label>
                    Alerta de estoque baixo
                    <input
                      name="lowStock"
                      type="number"
                      required
                      min={0}
                      defaultValue={data.settings.lowStock}
                    />
                  </label>
                </div>
                <div className="notice">
                  O preço editado vale para novas assinaturas. Contratos existentes preservam a
                  mensalidade da adesão. Frete segue incluído no plano.
                </div>
                <Button loading={pending}>Salvar configurações</Button>
              </>
            )}
          </Form>
        </section>
        <aside className="stack">
          <section className="admin-panel">
            <h2>Serviços</h2>
            {['Cartão e Pix', 'Transportadora', 'E-mail de oração'].map((label) => (
              <div className="integration-status" key={label}>
                <span>{label}</span>
                <StatusBadge status={IS_DEMO ? 'Simulado' : 'Via API'} />
              </div>
            ))}
            <div className="integration-status">
              <span>Armazenamento</span>
              <strong>{IS_DEMO ? 'Neste navegador' : 'API da operação'}</strong>
            </div>
            {IS_DEMO && (
              <p>
                Este painel não contém chaves de serviços nem realiza cobranças, envios ou
                comunicações reais.
              </p>
            )}
          </section>
          <section className="admin-panel">
            <h2>Rastreabilidade</h2>
            <p>As alterações ficam registradas no histórico da operação.</p>
            <ButtonLink className="small full" variant="secondary" href="/admin/atividade">
              Ver atividade da operação
            </ButtonLink>
          </section>
        </aside>
      </div>
    </>
  );
}
export function AdminTeam() {
  const data = useAdminData(),
    [editing, setEditing] = useState<TeamMember | 'new' | null>(null),
    action = useAdminAction();
  return (
    <>
      <AdminHeading
        title="Equipe e perfis"
        description={
          IS_DEMO
            ? 'Cadastros e funções ilustrativas. Não há autenticação real.'
            : 'Gerencie integrantes e seus perfis de acesso.'
        }
        actions={
          <Button className="small" onClick={() => setEditing('new')}>
            <Icon name="plus" />
            Adicionar integrante
          </Button>
        }
      />
      <DataTable
        rows={data.team}
        columns={[
          { key: 'name', label: 'Integrante', render: (u) => u.name },
          { key: 'email', label: 'E-mail', render: (u) => u.email },
          { key: 'role', label: 'Perfil', render: (u) => u.role },
          { key: 'status', label: 'Situação', render: (u) => <StatusBadge status={u.status} /> },
          {
            key: 'edit',
            label: '',
            render: (u) => (
              <Button variant="secondary" className="small" onClick={() => setEditing(u)}>
                Editar perfil
              </Button>
            ),
          },
        ]}
      />
      {IS_DEMO && (
        <div className="notice" style={{ marginTop: 24 }}>
          Perfis e permissões são demonstrativos. Alterar um perfil neste modo não aplica controles
          de acesso reais.
        </div>
      )}
      <AdminError error={action.error} />
      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Integrante da equipe"
      >
        {editing && (
          <Form
            onSubmit={async (d) => {
              await action.run({
                type: 'team.save',
                member: {
                  id: editing === 'new' ? uid('U') : editing.id,
                  name: text(d, 'name'),
                  email: text(d, 'email'),
                  role: text(d, 'role'),
                  status: text(d, 'status') as 'Ativo' | 'Inativo',
                },
              });
              setEditing(null);
            }}
          >
            {(pending) => (
              <>
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    defaultValue={editing === 'new' ? '' : editing.name}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editing === 'new' ? '' : editing.email}
                  />
                </label>
                <label>
                  Perfil
                  <select
                    name="role"
                    defaultValue={editing === 'new' ? 'Atendimento' : editing.role}
                  >
                    {['Administrador', 'Atendimento', 'Produção', 'Financeiro'].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Situação
                  <select name="status" defaultValue={editing === 'new' ? 'Ativo' : editing.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <Button loading={pending}>Salvar integrante</Button>
              </>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
}

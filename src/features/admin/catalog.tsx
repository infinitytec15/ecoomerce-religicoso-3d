'use client';
import { useState } from 'react';
import { ProductEditor } from './product-editor';
import { StockControl } from './product-stock';
import { WorkspaceSettingsPanel } from './workspace-settings';
import { InvitationManager } from './invitations';
import { EditionsManager } from './editions-manager';
import type { InventoryProduct, TeamMember } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { AdminHeading, AdminError, exportAdmin, useAdminAction, useAdminFilter } from './shared';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Form, text } from '@/components/ui/form';
import { ProductImage } from '@/components/ui/product-image';
import { StatusBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/ui/data-table';
import { money, uid } from '@/lib/domain/format';
import { IS_DEMO } from '@/lib/api/config';
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
          {
            key: 'media',
            label: 'Vitrine / 3D',
            render: (p) => (
              <>
                <span>{p.media?.length || 1} mídias</span>
                <small>{p.model?.status === 'ready' ? '3D disponível' : 'Sem arquivo 3D'}</small>
              </>
            ),
          },
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
          { key: 'stockActions', label: 'Estoque', render: (p) => <StockControl product={p} /> },
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
        className="product-editor-dialog"
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
  return <EditionsManager />;
}
export function AdminSettings() {
  return <WorkspaceSettingsPanel />;
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
      <InvitationManager />
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

'use client';
import { useState } from 'react';
import type { Permission, Role } from '@/lib/domain/types';
import { useAdminData } from './admin-frame';
import { useAdminAction } from './shared';
import { adminNavigation } from './admin-frame';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Form, text } from '@/components/ui/form';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { dateLabel } from '@/lib/domain/format';
import { useNotify } from '@/components/ui/feedback';
export function InvitationManager() {
  const data = useAdminData(),
    action = useAdminAction(),
    [open, setOpen] = useState(false),
    notify = useNotify();
  return (
    <section className="admin-panel invitation-section">
      <div className="admin-panel-heading">
        <div>
          <h2>Convide quem cuida junto.</h2>
          <p>Acesso por função, com convite válido por sete dias.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Convidar pessoa</Button>
      </div>
      <DataTable
        rows={data.invitations}
        columns={[
          {
            key: 'name',
            label: 'Pessoa convidada',
            render: (i) => (
              <>
                <strong>{i.name}</strong>
                <small>{i.email}</small>
              </>
            ),
          },
          {
            key: 'role',
            label: 'Perfil',
            render: (i) =>
              ({
                admin: 'Administrador',
                support: 'Atendimento',
                production: 'Produção',
                finance: 'Financeiro',
              })[i.role],
          },
          { key: 'expires', label: 'Validade', render: (i) => dateLabel(i.expiresAt) },
          {
            key: 'status',
            label: 'Situação',
            render: (i) => (
              <StatusBadge
                status={
                  i.status === 'Pendente' && i.expiresAt < new Date().toISOString()
                    ? 'Expirado'
                    : i.status
                }
              />
            ),
          },
          {
            key: 'actions',
            label: 'Ações',
            render: (i) =>
              i.status !== 'Aceito' && (
                <div className="row wrap">
                  <Button
                    variant="text"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          location.origin + '/convite/' + i.token,
                        );
                        notify('Link copiado. No protótipo, abra neste mesmo navegador.');
                      } catch {
                        notify('Não foi possível copiar o link.');
                      }
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button
                    variant="text"
                    disabled={action.pending}
                    onClick={() =>
                      action.execute(
                        { type: 'invite.resend', id: i.id },
                        'Convite renovado. Nenhum e-mail enviado na demonstração.',
                      )
                    }
                  >
                    Renovar
                  </Button>
                  {i.status === 'Pendente' && (
                    <Button
                      variant="text"
                      disabled={action.pending}
                      onClick={() => action.execute({ type: 'invite.revoke', id: i.id })}
                    >
                      Revogar
                    </Button>
                  )}
                </div>
              ),
          },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="Convidar para a equipe">
        <Form
          onSubmit={async (d) => {
            await action.run(
              {
                type: 'invite.create',
                name: text(d, 'name'),
                email: text(d, 'email'),
                role: text(d, 'role') as Exclude<Role, 'customer'>,
                permissions: d.getAll('permissions').map(String) as Permission[],
              },
              'Convite criado. Copie o link para testar a aceitação local.',
            );
            setOpen(false);
          }}
        >
          {(pending) => (
            <>
              <div className="form-grid">
                <label>
                  Nome
                  <input name="name" required minLength={3} />
                </label>
                <label>
                  E-mail
                  <input name="email" type="email" required />
                </label>
                <label>
                  Perfil
                  <select name="role">
                    <option value="support">Atendimento</option>
                    <option value="production">Produção</option>
                    <option value="finance">Financeiro</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
              </div>
              <fieldset className="permissions-grid">
                <legend>Áreas de acesso</legend>
                {adminNavigation
                  .filter(
                    (row, index, all) =>
                      row[3] && all.findIndex((other) => other[3] === row[3]) === index,
                  )
                  .map(([id, label, , permission]) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission}
                        defaultChecked={['support', 'customers'].includes(permission!)}
                      />
                      {label}
                    </label>
                  ))}
              </fieldset>
              <p className="notice">
                Convite de demonstração: o link funciona neste navegador e nenhum e-mail é enviado.
                A API aplicará autenticação e permissões reais.
              </p>
              <Button loading={pending}>Criar convite</Button>
            </>
          )}
        </Form>
      </Modal>
    </section>
  );
}

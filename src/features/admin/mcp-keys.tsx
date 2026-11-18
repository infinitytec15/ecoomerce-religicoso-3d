'use client';
import { useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { permissionSchema } from '@maos-em-oracao/contracts';
import { HttpClient } from '@/lib/api/http';
import { IS_DEMO } from '@/lib/api/config';
import { errorMessage } from '@/lib/api/contracts';
import { dateLabel } from '@/lib/domain/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Form, text } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { useNotify } from '@/components/ui/feedback';
import { adminNavigation } from './admin-frame';

const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  fullAccess: z.boolean(),
  permissions: z.array(permissionSchema),
  createdBy: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
type ApiKey = z.infer<typeof apiKeySchema>;
const createdSchema = z.object({ key: z.string(), apiKey: apiKeySchema });
const queryKey = ['admin', 'api-keys'] as const;
const noSubscription = () => () => {};

/** One row per permission, labelled like the admin menu (same list the invitations use). */
const permissionOptions = () =>
  adminNavigation.filter(
    (row, index, all) => row[3] && all.findIndex((other) => other[3] === row[3]) === index,
  );

function keyStatus(k: ApiKey) {
  if (k.revokedAt) return 'Revogada';
  if (k.expiresAt && k.expiresAt <= new Date().toISOString()) return 'Expirada';
  return 'Ativa';
}

function CopyField({ label, value }: { label: string; value: string }) {
  const notify = useNotify();
  return (
    <label>
      {label}
      <div className="row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="secondary"
          className="small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              notify('Copiado.');
            } catch {
              notify('Não foi possível copiar. Selecione o texto e copie manualmente.');
            }
          }}
        >
          Copiar
        </Button>
      </div>
    </label>
  );
}

function ConnectionGuide({ endpoint, apiKey }: { endpoint: string; apiKey: string }) {
  return (
    <div className="stack">
      <CopyField label="Chave (aparece só agora)" value={apiKey} />
      <CopyField
        label="ChatGPT e Claude.ai: URL do conector (já inclui a chave)"
        value={endpoint + '/' + apiKey}
      />
      <CopyField
        label="Claude Code: comando no terminal"
        value={`claude mcp add --transport http maos-em-oracao ${endpoint} --header "Authorization: Bearer ${apiKey}"`}
      />
      <p className="notice">
        Guarde a chave agora: depois ela não pode ser exibida de novo. Quem tiver a chave (ou a URL
        com ela) age na loja com as permissões escolhidas. Se vazar, revogue-a aqui.
      </p>
    </div>
  );
}

function CreateKeyForm({ onCreated }: { onCreated: (key: string) => void }) {
  const client = useQueryClient(),
    [fullAccess, setFullAccess] = useState(true);
  return (
    <Form
      onSubmit={async (d) => {
        const expires = text(d, 'expires');
        const created = await new HttpClient().request('admin/api-keys', createdSchema, {
          method: 'POST',
          body: {
            name: text(d, 'name'),
            fullAccess,
            permissions: fullAccess ? [] : d.getAll('permissions').map(String),
            expiresInDays: expires ? Number(expires) : null,
          },
        });
        await client.invalidateQueries({ queryKey });
        onCreated(created.key);
      }}
    >
      {(pending) => (
        <>
          <div className="form-grid">
            <label>
              Nome da chave
              <input
                name="name"
                required
                minLength={3}
                maxLength={60}
                placeholder="ChatGPT da loja"
              />
            </label>
            <label>
              Validade
              <select name="expires" defaultValue="90">
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                <option value="365">1 ano</option>
                <option value="">Sem prazo</option>
              </select>
            </label>
          </div>
          <fieldset className="stack">
            <legend>Acesso</legend>
            <label className="setting-toggle">
              <span>Acesso total (tudo que o responsável pela loja pode fazer)</span>
              <input
                type="checkbox"
                checked={fullAccess}
                onChange={(e) => setFullAccess(e.target.checked)}
              />
            </label>
          </fieldset>
          {!fullAccess && (
            <fieldset className="permissions-grid">
              <legend>Áreas liberadas para a IA</legend>
              {permissionOptions().map(([id, label, , permission]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission}
                    defaultChecked={permission === 'catalog'}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <Button loading={pending}>Gerar chave</Button>
        </>
      )}
    </Form>
  );
}

/** Settings › Integrações com IA: API keys for the MCP endpoint used by Claude and ChatGPT. */
export function McpKeysPanel() {
  const notify = useNotify(),
    client = useQueryClient(),
    origin = useSyncExternalStore(
      noSubscription,
      () => window.location.origin,
      () => '',
    ),
    endpoint = origin + '/api/mcp',
    [open, setOpen] = useState(false),
    [createdKey, setCreatedKey] = useState(''),
    keys = useQuery({
      queryKey,
      queryFn: () => new HttpClient().request('admin/api-keys', z.array(apiKeySchema)),
      enabled: !IS_DEMO,
    }),
    revoke = useMutation({
      mutationFn: (id: string) =>
        new HttpClient().request('admin/api-keys/' + id + '/revoke', z.unknown(), {
          method: 'POST',
          body: {},
        }),
      onSuccess: async () => {
        notify('Chave revogada. Ela para de funcionar imediatamente.');
        await client.invalidateQueries({ queryKey });
      },
      onError: (error) => notify(errorMessage(error)),
    });
  const close = () => {
    setOpen(false);
    setCreatedKey('');
  };
  return (
    <div className="stack">
      <div className="admin-panel-heading">
        <div>
          <h2>Integrações com IA (MCP)</h2>
          <p>
            Conecte o Claude ou o ChatGPT à gestão da loja: cadastrar e editar produtos, consultar
            pedidos, clientes, estoque e relatórios, e executar qualquer operação do painel.
          </p>
        </div>
        {!IS_DEMO && <Button onClick={() => setOpen(true)}>Gerar chave</Button>}
      </div>
      {IS_DEMO ? (
        <p className="notice">
          No modo demonstração não há servidor MCP. Configure a API para gerar chaves.
        </p>
      ) : (
        <>
          <CopyField label="Endereço do servidor MCP" value={endpoint} />
          <details>
            <summary>Como conectar</summary>
            <ol className="stack">
              <li>
                <strong>ChatGPT</strong>: Configurações › Aplicativos e conectores › Avançado ›
                ative o Modo desenvolvedor › Criar conector. Cole a URL do conector, escolha
                &quot;Sem autenticação&quot; (a chave já vai na URL) e salve.
              </li>
              <li>
                <strong>Claude.ai / Claude Desktop</strong>: Configurações › Conectores › Adicionar
                conector personalizado. Cole a mesma URL do conector.
              </li>
              <li>
                <strong>Claude Code</strong>: rode o comando mostrado ao gerar a chave; ele envia a
                chave no cabeçalho Authorization.
              </li>
            </ol>
          </details>
          {keys.isError && (
            <p className="form-error" role="alert">
              {errorMessage(keys.error)}
            </p>
          )}
          <DataTable
            rows={keys.data ?? []}
            columns={[
              {
                key: 'name',
                label: 'Chave',
                render: (k) => (
                  <>
                    <strong>{k.name}</strong>
                    <small>{k.prefix}…</small>
                  </>
                ),
              },
              {
                key: 'access',
                label: 'Acesso',
                render: (k) =>
                  k.fullAccess
                    ? 'Total'
                    : `${k.permissions.length} área(s): ${k.permissions.join(', ')}`,
              },
              {
                key: 'used',
                label: 'Último uso',
                render: (k) => (k.lastUsedAt ? dateLabel(k.lastUsedAt) : 'Nunca'),
              },
              {
                key: 'expires',
                label: 'Validade',
                render: (k) => (k.expiresAt ? dateLabel(k.expiresAt) : 'Sem prazo'),
              },
              {
                key: 'status',
                label: 'Situação',
                render: (k) => <StatusBadge status={keyStatus(k)} />,
              },
              {
                key: 'actions',
                label: 'Ações',
                render: (k) =>
                  keyStatus(k) === 'Ativa' && (
                    <Button
                      variant="text"
                      disabled={revoke.isPending}
                      onClick={() => {
                        if (confirm(`Revogar a chave "${k.name}"? A IA conectada perde o acesso.`))
                          revoke.mutate(k.id);
                      }}
                    >
                      Revogar
                    </Button>
                  ),
              },
            ]}
          />
        </>
      )}
      <Modal
        open={open}
        onOpenChange={(next) => !next && close()}
        title={createdKey ? 'Chave criada' : 'Nova chave MCP'}
      >
        {createdKey ? (
          <div className="stack">
            <ConnectionGuide endpoint={endpoint} apiKey={createdKey} />
            <Button onClick={close}>Já guardei a chave</Button>
          </div>
        ) : (
          <CreateKeyForm onCreated={setCreatedKey} />
        )}
      </Modal>
    </div>
  );
}

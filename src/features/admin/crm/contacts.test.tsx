import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MarketingContactRow } from '@maos-em-oracao/contracts';
import { ContactsTab } from './contacts';
import { CrmSettings } from './settings';
import { CustomerMarketingCard } from './customer-marketing';
import { ImportDialog } from './import-dialog';

const { run, gateway, session } = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue(undefined),
  gateway: { crmContacts: vi.fn(), crmImport: vi.fn() },
  session: { value: {} as Record<string, unknown> },
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  useAdminAction: () => ({ run }),
}));
const adminData = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../admin-frame', () => ({ useAdminData: () => adminData.value }));
vi.mock('@/lib/api/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/query')>()),
  useGateway: () => gateway,
  useSession: () => ({ data: session.value }),
}));

const settings = {
  senderName: 'Mãos em Oração',
  replyTo: 'oi@loja.com',
  footerText: 'Você recebe por ter aceitado.',
  hourlyLimit: 100,
  legitimateInterest: true,
};
const contact = (over: Partial<MarketingContactRow>): MarketingContactRow => ({
  id: 'k1',
  email: 'ana@x.com',
  name: 'Ana',
  legalBasis: 'consent',
  consentAt: '2026-11-10T15:00:00.000Z',
  consentSource: 'checkout',
  unsubscribedAt: null,
  tags: ['vip', 'paróquia'],
  eligible: true,
  isCustomer: true,
  ...over,
});
const csv = (rows: string[]) => new File([rows.join('\n')], 'contatos.csv', { type: 'text/csv' });

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  gateway.crmContacts.mockReset();
  gateway.crmImport.mockReset();
  run.mockResolvedValue(undefined);
  session.value = { owner: true, permissions: ['marketing'] };
  adminData.value = {
    crm: {
      settings,
      campaigns: [],
      tags: [{ tag: 'vip', count: 3 }],
      totals: { contacts: 10, eligible: 8, unsubscribed: 1 },
    },
  };
});

describe('importação de CSV', () => {
  async function load(user: ReturnType<typeof userEvent.setup>, rows: string[]) {
    await user.upload(screen.getByLabelText('Arquivo CSV'), csv(rows));
  }
  const open = () => wrap(<ImportDialog open onClose={() => {}} onImported={() => {}} />);

  it('mostra a prévia, exige etiqueta e consentimento e importa', async () => {
    const user = userEvent.setup();
    gateway.crmImport.mockResolvedValue({ created: 2, updated: 0, keptUnsubscribed: 0 });
    open();
    await load(user, [
      'email,nome',
      'ana@x.com,Ana',
      'bia@x.com,Bia',
      'não-é-email,Zé',
      'ANA@x.com,Ana',
    ]);
    expect(await screen.findByText('2 contatos válidos · 1 inválido · 1 repetido')).toBeVisible();
    expect(screen.getByText('ana@x.com · Ana')).toBeVisible();
    const submit = screen.getByRole('button', { name: 'Importar' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Etiqueta do grupo'), 'Paróquia São José');
    expect(submit).toBeDisabled();
    await user.click(screen.getByLabelText(/Tenho o consentimento/));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(gateway.crmImport).toHaveBeenCalledWith({
      tag: 'Paróquia São José',
      consent: true,
      rows: [
        { email: 'ana@x.com', name: 'Ana' },
        { email: 'bia@x.com', name: 'Bia' },
      ],
    });
    expect(
      await screen.findByText('2 novos, 0 atualizados, 0 continuam descadastrados'),
    ).toBeVisible();
  });

  it('pede o consentimento de novo a cada arquivo e ao reabrir', async () => {
    const user = userEvent.setup(),
      dialog = (isOpen: boolean) => (
        <QueryClientProvider client={client}>
          <ImportDialog open={isOpen} onClose={() => {}} onImported={() => {}} />
        </QueryClientProvider>
      ),
      client = new QueryClient(),
      view = render(dialog(true)),
      consentBox = () => screen.getByLabelText(/Tenho o consentimento/),
      submit = () => screen.getByRole('button', { name: 'Importar' });
    await load(user, ['ana@x.com']);
    await screen.findByText(/1 contato válido/);
    await user.type(screen.getByLabelText('Etiqueta do grupo'), 'Lote');
    await user.click(consentBox());
    expect(submit()).toBeEnabled();
    await load(user, ['bia@x.com']);
    await screen.findByText('bia@x.com');
    expect(consentBox()).not.toBeChecked();
    expect(screen.getByLabelText('Etiqueta do grupo')).toHaveValue('Lote');
    expect(submit()).toBeDisabled();
    await user.click(consentBox());
    expect(submit()).toBeEnabled();
    view.rerender(dialog(false));
    view.rerender(dialog(true));
    expect(consentBox()).not.toBeChecked();
  });

  it('envia 2.500 linhas em 3 chamadas de até 1.000 e soma o resumo', async () => {
    const user = userEvent.setup();
    gateway.crmImport.mockImplementation(async ({ rows }: { rows: unknown[] }) => ({
      created: rows.length - 1,
      updated: 1,
      keptUnsubscribed: 0,
    }));
    open();
    await load(
      user,
      Array.from({ length: 2500 }, (_, i) => `p${i}@x.com,P${i}`),
    );
    await screen.findByText('2.500 contatos válidos · 0 inválidos · 0 repetidos');
    await user.type(screen.getByLabelText('Etiqueta do grupo'), 'Lote');
    await user.click(screen.getByLabelText(/Tenho o consentimento/));
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    await screen.findByText('2.497 novos, 3 atualizados, 0 continuam descadastrados');
    expect(gateway.crmImport.mock.calls.map(([input]) => input.rows.length)).toEqual([
      1000, 1000, 500,
    ]);
  });

  it('para no primeiro erro e diz quantos já entraram', async () => {
    const user = userEvent.setup();
    gateway.crmImport
      .mockResolvedValueOnce({ created: 1000, updated: 0, keptUnsubscribed: 0 })
      .mockRejectedValueOnce(new Error('Falha de rede.'));
    open();
    await load(
      user,
      Array.from({ length: 2500 }, (_, i) => `p${i}@x.com`),
    );
    await screen.findByText(/2.500 contatos válidos/);
    await user.type(screen.getByLabelText('Etiqueta do grupo'), 'Lote');
    await user.click(screen.getByLabelText(/Tenho o consentimento/));
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    const alert = await screen.findByText(/Falha de rede\./);
    expect(alert).toHaveTextContent('Foram importados 1.000 de 2.500 contatos antes do erro');
    expect(alert).toHaveTextContent('só é atualizado');
    expect(gateway.crmImport).toHaveBeenCalledTimes(2);
  });

  it('recusa arquivo com mais de 5.000 contatos válidos', async () => {
    const user = userEvent.setup();
    open();
    await load(
      user,
      Array.from({ length: 5001 }, (_, i) => `p${i}@x.com`),
    );
    expect(
      await screen.findByText('Divida o arquivo em partes de até 5.000 contatos.'),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Etiqueta do grupo'), 'Lote');
    await user.click(screen.getByLabelText(/Tenho o consentimento/));
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });
});

describe('contatos', () => {
  it('lista com a situação e carrega mais', async () => {
    const user = userEvent.setup();
    gateway.crmContacts
      .mockResolvedValueOnce({
        items: [
          contact({}),
          contact({
            id: 'k2',
            email: 'sem@x.com',
            eligible: false,
            legalBasis: null,
            consentAt: null,
          }),
          contact({
            id: 'k3',
            email: 'saiu@x.com',
            eligible: false,
            unsubscribedAt: '2026-11-11T10:00:00.000Z',
          }),
        ],
        next: 'saiu@x.com',
      })
      .mockResolvedValueOnce({ items: [contact({ id: 'k4', email: 'zil@x.com' })] });
    wrap(<ContactsTab />);
    expect(await screen.findByText('Pode receber', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Sem aceite')).toBeVisible();
    expect(screen.getByText('Descadastrado')).toBeVisible();
    expect(screen.getAllByText('Consentimento')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(gateway.crmContacts).toHaveBeenLastCalledWith({ cursor: 'saiu@x.com' });
    expect(await screen.findByText('zil@x.com')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('filtra pela etiqueta', async () => {
    const user = userEvent.setup();
    gateway.crmContacts.mockResolvedValue({ items: [contact({})] });
    wrap(<ContactsTab />);
    await screen.findByText('ana@x.com');
    await user.click(screen.getByRole('button', { name: 'vip (3)' }));
    await waitFor(() => expect(gateway.crmContacts).toHaveBeenLastCalledWith({ tag: 'vip' }));
  });

  it('remover uma etiqueta salva o contato sem ela', async () => {
    const user = userEvent.setup();
    gateway.crmContacts.mockResolvedValue({ items: [contact({})] });
    wrap(<ContactsTab />);
    await user.click(await screen.findByRole('button', { name: 'ana@x.com' }));
    await user.click(await screen.findByRole('button', { name: 'Remover etiqueta vip' }));
    expect(run).toHaveBeenCalledWith(
      { type: 'crm.contact.save', email: 'ana@x.com', tags: ['paróquia'] },
      'Etiqueta removida.',
    );
  });

  it('adiciona etiqueta com Enter', async () => {
    const user = userEvent.setup();
    gateway.crmContacts.mockResolvedValue({ items: [contact({})] });
    wrap(<ContactsTab />);
    await user.click(await screen.findByRole('button', { name: 'ana@x.com' }));
    await user.type(await screen.findByLabelText('Nova etiqueta'), '  Natal   2026 {Enter}');
    expect(run).toHaveBeenCalledWith(
      { type: 'crm.contact.save', email: 'ana@x.com', tags: ['vip', 'paróquia', 'Natal 2026'] },
      'Etiqueta adicionada.',
    );
  });

  it('descadastra com confirmação e esconde o botão de quem já saiu', async () => {
    const user = userEvent.setup();
    gateway.crmContacts.mockResolvedValue({
      items: [
        contact({}),
        contact({
          id: 'k3',
          email: 'saiu@x.com',
          eligible: false,
          unsubscribedAt: '2026-11-11T10:00:00.000Z',
        }),
      ],
    });
    wrap(<ContactsTab />);
    await user.click(await screen.findByRole('button', { name: 'saiu@x.com' }));
    await screen.findByText(/Base legal: Consentimento/);
    expect(screen.queryByRole('button', { name: 'Marcar como descadastrado' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'ana@x.com' }));
    await user.click(await screen.findByRole('button', { name: 'Marcar como descadastrado' }));
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sim, descadastrar' }));
    expect(run).toHaveBeenCalledWith(
      { type: 'crm.contact.unsubscribe', email: 'ana@x.com' },
      'Contato descadastrado.',
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Marcar como descadastrado' })).toBeNull(),
    );
  });
});

describe('configurações', () => {
  it('quem não é dono não mexe no interruptor e salva o valor guardado', async () => {
    const user = userEvent.setup();
    session.value = { owner: false, permissions: ['marketing'] };
    render(<CrmSettings />);
    const toggle = screen.getByRole('switch', { name: /Incluir clientes que já compraram/ });
    expect(toggle).toBeDisabled();
    expect(toggle).toBeChecked();
    expect(screen.getByText(/Só o dono da loja pode mudar\./)).toBeVisible();
    await user.clear(screen.getByLabelText('Limite de envios por hora'));
    await user.type(screen.getByLabelText('Limite de envios por hora'), '200');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(run).toHaveBeenCalledWith(
      {
        type: 'crm.settings',
        settings: { ...settings, hourlyLimit: 200, legitimateInterest: true },
      },
      'Configurações salvas.',
    );
  });

  it('o dono pode desligar o legítimo interesse', async () => {
    const user = userEvent.setup();
    render(<CrmSettings />);
    await user.click(screen.getByRole('switch', { name: /Incluir clientes que já compraram/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(run).toHaveBeenCalledWith(
      { type: 'crm.settings', settings: { ...settings, legitimateInterest: false } },
      'Configurações salvas.',
    );
  });
});

describe('cartão no cliente', () => {
  it('usa a linha do e-mail exato e edita as etiquetas', async () => {
    const user = userEvent.setup();
    gateway.crmContacts.mockResolvedValue({
      items: [
        contact({ id: 'k9', email: 'ana@x.com.br', tags: ['outra'] }),
        contact({ id: 'k1', email: 'ana@x.com', tags: ['vip'] }),
      ],
    });
    render(<CustomerMarketingCard email=" Ana@X.com " />);
    expect(await screen.findByText('Pode receber')).toBeVisible();
    expect(gateway.crmContacts).toHaveBeenCalledWith({ q: 'ana@x.com' });
    expect(screen.queryByText('outra')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remover etiqueta vip' }));
    expect(run).toHaveBeenCalledWith(
      { type: 'crm.contact.save', email: 'ana@x.com', tags: [] },
      'Etiqueta removida.',
    );
  });

  it('não aparece sem a permissão de marketing', () => {
    session.value = { owner: false, permissions: ['customers'] };
    render(<CustomerMarketingCard email="ana@x.com" />);
    expect(screen.queryByText('E-mail marketing')).toBeNull();
    expect(gateway.crmContacts).not.toHaveBeenCalled();
  });
});

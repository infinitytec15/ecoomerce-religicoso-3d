import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AddressFields, emptyAddress } from '@/components/ui/address-fields';
import { Form } from '@/components/ui/form';
import { EmptyState, LoadingState, ErrorState } from '@/components/ui/states';
import { DataTable } from '@/components/ui/data-table';
const meta = {
  title: 'Essência/Interações',
  parameters: {
    docs: {
      description: {
        component:
          'Estados acessíveis, formulários e diálogos com foco contido, Escape e retorno ao acionador. Tabelas mantêm a rolagem horizontal restrita ao conteúdo.',
      },
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Revisar assinatura</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Cuidar da sua assinatura"
        description="Escolha como deseja continuar."
      >
        <p>Uma pausa também faz parte do caminho. Você pode retomar quando quiser.</p>
        <div className="row wrap">
          <Button onClick={() => setOpen(false)}>Manter assinatura</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Pausar próximos ciclos
          </Button>
        </div>
      </Modal>
    </>
  );
}
export const Dialogo: Story = {
  render: () => <DialogExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar assinatura' }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument();
  },
};
function AddressExample() {
  const [value, setValue] = useState(emptyAddress);
  return (
    <Form onSubmit={() => {}}>
      <AddressFields value={value} onChange={setValue} />
      <Button>Conferir endereço</Button>
    </Form>
  );
}
export const Endereco: Story = { render: () => <AddressExample /> };
export const Carregando: Story = {
  render: () => <LoadingState label="Preparando suas escolhas…" />,
};
export const FalhaDeServico: Story = {
  render: () => <ErrorState message="Não foi possível carregar seus pedidos." onRetry={() => {}} />,
};
export const EstadoVazio: Story = {
  render: () => (
    <EmptyState
      title="Sua história começa aqui."
      description="Seus pedidos aparecerão depois da primeira escolha."
      action={<Button>Explorar peças</Button>}
    />
  ),
};
const columns = [
  {
    key: 'name',
    label: 'Cliente',
    render: (r: { id: string; name: string; email: string }) => r.name,
  },
  {
    key: 'email',
    label: 'E-mail',
    render: (r: { id: string; name: string; email: string }) => r.email,
  },
];
export const TabelaComPaginacao: Story = {
  render: () => (
    <DataTable
      caption="Clientes da demonstração"
      columns={columns}
      rows={Array.from({ length: 24 }, (_, i) => ({
        id: String(i),
        name: `Cliente ${i + 1}`,
        email: `cliente${i + 1}@exemplo.com`,
      }))}
    />
  ),
};
export const TabelaVazia: Story = { render: () => <DataTable columns={columns} rows={[]} /> };

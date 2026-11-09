import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AdminFrame } from '@/features/admin/admin-frame';
import { ProductEditor } from '@/features/admin/product-editor';
import { RecordButton } from '@/features/admin/record-drawer';
import { AdminOverview } from '@/features/admin/overview';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { createSeed } from '@/lib/demo/seed';
const seed = createSeed();
const meta = {
  title: 'Gestão/Operação ampliada',
  parameters: {
    layout: 'fullscreen',
    commerceSession: 'admin',
    nextjs: { navigation: { pathname: '/admin' } },
  },
  decorators: [
    (Story) => (
      <AdminFrame>
        <Story />
      </AdminFrame>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const VisaoGeral: Story = { render: () => <AdminOverview /> };
function Editor({ fresh = false }: { fresh?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir cadastro</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={fresh ? 'Novo produto' : 'Editar produto'}
        className="product-editor-dialog"
      >
        <ProductEditor
          product={fresh ? undefined : seed.products[0]}
          onSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
export const ProdutoSemArquivo3D: Story = {
  render: () => <Editor />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Arquivo 3D' }));
    await expect(
      body.getByText('Visualização 3D desativada. Envie um arquivo para ativar.'),
    ).toBeVisible();
  },
};
export const ProdutoNovo: Story = { render: () => <Editor fresh /> };
export const DrawerPedido: Story = {
  render: () => (
    <RecordButton record={{ kind: 'order', id: seed.orders[0].id }}>Abrir pedido</RecordButton>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Abrir pedido' }),
    );
    await expect(await within(canvasElement.ownerDocument.body).findByRole('dialog')).toBeVisible();
  },
};
export const DrawerProducao: Story = {
  render: () => (
    <RecordButton record={{ kind: 'production', id: seed.jobs[0].id }}>
      Abrir ordem de produção
    </RecordButton>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Abrir ordem de produção' }),
    );
    await expect(await within(canvasElement.ownerDocument.body).findByRole('dialog')).toBeVisible();
  },
};

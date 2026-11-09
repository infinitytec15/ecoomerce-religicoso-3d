import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { Modal } from './modal';
import { Form } from './form';
import { DataTable } from './data-table';
import { Steps } from './steps';
describe('accessible shared components', () => {
  it('blocks duplicate actions while loading', async () => {
    const click = vi.fn();
    render(
      <Button loading onClick={click}>
        Salvar
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Salvar/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });
  it('contains focus, closes on Escape and restores the trigger', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Abrir</Button>
          <Modal open={open} onOpenChange={setOpen} title="Editar assinatura">
            <label>
              Nome
              <input />
            </label>
            <Button>Salvar</Button>
          </Modal>
        </>
      );
    }
    render(<Example />);
    const user = userEvent.setup(),
      trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Editar assinatura' });
    expect(dialog).toBeVisible();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it('surfaces service errors and re-enables the form for retry', async () => {
    render(
      <Form
        onSubmit={async () => {
          throw new Error('Não foi possível salvar.');
        }}
      >
        <label>
          Nome
          <input name="name" defaultValue="Ana" />
        </label>
        <Button>Salvar</Button>
      </Form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar.');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });
  it('paginates rows without dropping the table headings', async () => {
    render(
      <DataTable
        caption="Clientes"
        pageSize={2}
        rows={[
          { id: '1', name: 'Ana' },
          { id: '2', name: 'João' },
          { id: '3', name: 'Maria' },
        ]}
        columns={[{ key: 'name', label: 'Cliente', render: (r) => r.name }]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toBeVisible();
    expect(within(screen.getByRole('table')).queryByText('Maria')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(within(screen.getByRole('table')).getByText('Maria')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });
  it('marks the current checkout step with text and aria-current', () => {
    render(<Steps items={['Seus dados', 'Entrega', 'Pagamento']} current={1} />);
    expect(screen.getByText('Entrega')).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

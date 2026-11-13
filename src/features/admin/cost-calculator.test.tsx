import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultCalculatorSettings } from '@maos-em-oracao/contracts';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import { CalculatorSettingsEditor } from './cost-calculator-settings';
const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', () => ({ useAdminAction: () => ({ run }) }));
vi.mock('./admin-frame', () => ({
  useAdminData: () => ({ workspace: { ...defaultWorkspaceSettings } }),
}));

describe('calculator settings editor', () => {
  beforeEach(() => run.mockClear());

  it('saves edited material price and Pix fee into the workspace', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    const price = screen.getAllByLabelText('Preço por kg')[0];
    await user.clear(price);
    await user.type(price, '130,00');
    const pix = screen.getByLabelText('Taxa Pix (%)');
    await user.clear(pix);
    await user.type(pix, '0,99');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const call = run.mock.calls[0][0];
    expect(call.type).toBe('workspace.save');
    expect(call.settings.costCalculator.materials[0].priceCents).toBe(13000);
    expect(call.settings.costCalculator.pixFeePct).toBe(0.99);
    expect(call.settings.legalName).toBe(defaultWorkspaceSettings.legalName);
  });

  it('labels resin prices per litre and blocks an invalid configuration', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    expect(screen.getByLabelText('Preço por litro')).toBeInTheDocument();
    await user.clear(screen.getAllByLabelText('Nome do material')[0]);
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('adds and removes a material', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar material' }));
    expect(screen.getAllByLabelText('Nome do material')).toHaveLength(3);
    await user.click(screen.getAllByRole('button', { name: 'Remover material' })[2]);
    expect(screen.getAllByLabelText('Nome do material')).toHaveLength(2);
  });
});

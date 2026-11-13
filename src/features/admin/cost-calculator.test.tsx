import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultCalculatorSettings } from '@maos-em-oracao/contracts';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import { CalculatorSettingsEditor } from './cost-calculator-settings';
import { AdminCostCalculator, PrintCostForm } from './cost-calculator';
const { run } = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  useAdminAction: () => ({ run }),
}));
const { owner } = vi.hoisted(() => ({ owner: { value: true } }));
vi.mock('@/lib/api/query', () => ({
  useSession: () => ({ data: { owner: owner.value } }),
}));
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
    expect(run.mock.calls[0][1]).toBe('Configuração da calculadora salva.');
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

  it('reads a printer purchase value typed with thousand separators', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    const purchase = screen.getAllByLabelText('Valor de compra (R$)')[0];
    await user.clear(purchase);
    await user.type(purchase, '6.000,00');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0].settings.costCalculator.printers[0].purchaseCents).toBe(600000);
  });

  it('blocks the save and names the field when money text is invalid', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    const purchase = screen.getAllByLabelText('Valor de compra (R$)')[0];
    await user.clear(purchase);
    await user.type(purchase, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    const name = defaultCalculatorSettings.printers[0].name;
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Valor inválido em Valor de compra (${name}).`,
    );
    expect(run).not.toHaveBeenCalled();
    await user.clear(purchase);
    await user.type(purchase, '6.000');
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it('hides the save button when read-only', () => {
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} readOnly />);
    expect(screen.queryByRole('button', { name: 'Salvar configuração' })).not.toBeInTheDocument();
    expect(screen.getByText('Só o proprietário altera esta configuração.')).toBeInTheDocument();
  });

  it('adds and removes a material', async () => {
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar material' }));
    expect(screen.getAllByLabelText('Nome do material')).toHaveLength(3);
    await user.click(screen.getAllByRole('button', { name: 'Remover material' })[2]);
    expect(screen.getAllByLabelText('Nome do material')).toHaveLength(2);
  });

  it('shows an alert when saving fails', async () => {
    run.mockRejectedValueOnce(new Error('falhou'));
    const user = userEvent.setup();
    render(<CalculatorSettingsEditor value={defaultCalculatorSettings} />);
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('print cost form', () => {
  it('computes cost, suggested price and monthly projection live', async () => {
    const user = userEvent.setup();
    render(<PrintCostForm settings={defaultCalculatorSettings} />);
    const fill = async (label: string, value: string) => {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    };
    await fill('Filamento (g)', '120');
    await fill('Tempo de impressão (h)', '6');
    await fill('Peças por mesa', '1');
    await fill('Mão de obra (min)', '20');
    await user.selectOptions(screen.getByLabelText('Embalagem'), 'Padrão');
    expect(screen.getByTestId('total-cost')).toHaveTextContent('R$ 42,29');
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('R$ 68,87');
    await fill('Preço praticado (R$)', '69,90');
    await fill('Vendas por mês', '50');
    expect(screen.getByTestId('monthly-profit')).toHaveTextContent('R$ 580,50');
    expect(screen.getByTestId('break-even')).toHaveTextContent('24 vendas');
  });

  it('warns when margin and fees reach 100%', () => {
    render(<PrintCostForm settings={{ ...defaultCalculatorSettings, targetMarginPct: 95 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Margem e taxas somam 100% ou mais');
  });

  it('switches amount label and offers apply only with onApply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(<PrintCostForm settings={defaultCalculatorSettings} />);
    expect(screen.queryByRole('button', { name: 'Usar este custo' })).not.toBeInTheDocument();
    rerender(<PrintCostForm settings={defaultCalculatorSettings} onApply={onApply} />);
    await user.selectOptions(screen.getByLabelText('Tecnologia'), 'resin');
    expect(screen.getByLabelText('Resina (ml)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar este custo' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].totalCents).toBeGreaterThan(0);
  });

  it('shows a hint instead of crashing when no material exists for the technology', async () => {
    const user = userEvent.setup();
    const settings = {
      ...defaultCalculatorSettings,
      materials: defaultCalculatorSettings.materials.filter((m) => m.technology === 'fdm'),
    };
    render(<PrintCostForm settings={settings} />);
    await user.selectOptions(screen.getByLabelText('Tecnologia'), 'resin');
    expect(screen.getByText(/Cadastre um material e uma impressora/)).toBeInTheDocument();
  });
});

describe('admin cost calculator page', () => {
  it('falls back to the default settings when the workspace has none', async () => {
    const user = userEvent.setup();
    render(<AdminCostCalculator />);
    expect(screen.getByRole('heading', { name: 'Calculadora de custos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PLA' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Configuração' }));
    expect(screen.getAllByLabelText('Nome do material')[0]).toHaveValue('PLA');
    expect(screen.getByRole('button', { name: 'Salvar configuração' })).toBeInTheDocument();
  });

  it('shows the configuration read-only to non-owners', async () => {
    owner.value = false;
    try {
      const user = userEvent.setup();
      render(<AdminCostCalculator />);
      await user.click(screen.getByRole('button', { name: 'Configuração' }));
      expect(screen.queryByRole('button', { name: 'Salvar configuração' })).not.toBeInTheDocument();
      expect(screen.getByText(/Só o proprietário/)).toBeInTheDocument();
    } finally {
      owner.value = true;
    }
  });
});

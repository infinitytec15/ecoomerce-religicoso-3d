import { describe, it, expect, vi } from 'vitest';
import { lookupCep, maskCep } from './address';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('CEP', () => {
  it('aplica a máscara enquanto a pessoa digita', () => {
    expect(maskCep('0100')).toBe('0100');
    expect(maskCep('01001000')).toBe('01001-000');
    expect(maskCep('01001-0009999')).toBe('01001-000');
    expect(maskCep('abc01.001')).toBe('01001');
  });
  it('preenche rua, bairro, cidade e estado pelo ViaCEP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    );
    expect(await lookupCep('01001-000', undefined, fetcher)).toEqual({
      street: 'Praça da Sé',
      district: 'Sé',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(fetcher.mock.calls[0][0]).toBe('https://viacep.com.br/ws/01001000/json/');
  });
  it('retorna nulo para CEP inexistente ou incompleto, sem consultar à toa', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ erro: 'true' }));
    expect(await lookupCep('99999-999', undefined, fetcher)).toBeNull();
    expect(await lookupCep('0100', undefined, fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('falha de rede vira erro para cair no preenchimento manual', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 503));
    await expect(lookupCep('01001000', undefined, fetcher)).rejects.toThrow('CEP_LOOKUP_FAILED');
  });
});

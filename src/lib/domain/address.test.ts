import { describe, it, expect, vi } from 'vitest';
import { lookupCep, maskCep, maskDocument, maskPhone } from './address';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('máscaras de contato', () => {
  it('formata celular e fixo com DDD', () => {
    expect(maskPhone('15997855287')).toBe('(15) 99785-5287');
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
    expect(maskPhone('(15) 9978')).toBe('(15) 9978');
    expect(maskPhone('1')).toBe('(1');
    expect(maskPhone('')).toBe('');
  });
  it('formata CPF e passa para CNPJ quando há mais dígitos', () => {
    expect(maskDocument('35206258814')).toBe('352.062.588-14');
    expect(maskDocument('3520625')).toBe('352.062.5');
    expect(maskDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskDocument('352.062.588-14').replace(/\D/g, '')).toBe('35206258814');
  });
});
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

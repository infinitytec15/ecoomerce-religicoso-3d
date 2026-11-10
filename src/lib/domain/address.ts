import { z } from 'zod';
import type { Address } from './types';
/** Formats partial input as 00000-000 while the customer types. */
export function maskCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
}
/** (11) 3333-4444 or (11) 99999-8888 while typing. */
export function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? '(' + d : '';
  const local = d.slice(2),
    split = d.length === 11 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${local.length > split ? local.slice(0, split) + '-' + local.slice(split) : local}`;
}
/** CPF 000.000.000-00, switching to CNPJ 00.000.000/0000-00 after 11 digits. */
export function maskDocument(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11)
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}
const viaCepSchema = z.union([
  z.object({ erro: z.union([z.literal(true), z.literal('true')]) }),
  z.object({
    logradouro: z.string(),
    bairro: z.string(),
    localidade: z.string(),
    uf: z.string().length(2),
  }),
]);
export type CepAddress = Pick<Address, 'street' | 'district' | 'city' | 'state'>;
/**
 * Looks up a Brazilian CEP on ViaCEP. Resolves null when the CEP does not exist;
 * rejects on network/format failures so the form can fall back to manual entry.
 */
export async function lookupCep(
  cep: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const response = await fetcher(`https://viacep.com.br/ws/${digits}/json/`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (response.status === 400) return null;
  if (!response.ok) throw new Error('CEP_LOOKUP_FAILED');
  const data = viaCepSchema.parse(await response.json());
  if ('erro' in data) return null;
  return {
    street: data.logradouro,
    district: data.bairro,
    city: data.localidade,
    state: data.uf.toUpperCase(),
  };
}
export function normalizeAddress(a: Partial<Address> = {}): Address {
  return {
    name: a.name || 'Cliente de demonstração',
    email: a.email || 'cliente@exemplo.com',
    phone: a.phone || '11999990000',
    cep: a.cep || '01001-000',
    street: a.street || 'Rua Exemplo',
    number: a.number || '123',
    extra: a.extra || '',
    district: a.district || 'Centro',
    city: a.city || 'São Paulo',
    state: a.state || 'SP',
  };
}

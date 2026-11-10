import { z } from 'zod';
import type { Address } from './types';
/** Formats partial input as 00000-000 while the customer types. */
export function maskCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits;
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

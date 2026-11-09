import type { Address } from './types';
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

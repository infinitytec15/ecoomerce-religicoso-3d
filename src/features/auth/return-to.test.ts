import { describe, it, expect } from 'vitest';
import { safeReturnTo } from './auth-screen';
describe('retorno após entrar', () => {
  it('cliente pode voltar ao checkout ou à conta', () => {
    expect(safeReturnTo('/checkout', 'customer')).toBe('/checkout');
    expect(safeReturnTo('/conta/pedidos', 'customer')).toBe('/conta/pedidos');
  });
  it('recusa destinos fora da área permitida', () => {
    for (const path of [
      '/checkoutx',
      '/admin',
      '//evil.example',
      'https://evil.example',
      '/conta\\x',
    ])
      expect(safeReturnTo(path, 'customer')).toBe('/conta');
    expect(safeReturnTo('/checkout', 'staff')).toBe('/admin');
    expect(safeReturnTo(undefined, 'staff')).toBe('/admin');
  });
});

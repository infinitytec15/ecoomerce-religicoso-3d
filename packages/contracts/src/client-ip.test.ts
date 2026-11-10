import { describe, it, expect } from 'vitest';
import { trustedForwardedIp } from './client-ip';
describe('IP do cliente atrás do proxy', () => {
  it('usa somente a entrada acrescentada pelo proxy mais próximo', () => {
    expect(trustedForwardedIp('203.0.113.7')).toBe('203.0.113.7');
    expect(trustedForwardedIp('1.1.1.1, 2.2.2.2, 198.51.100.20')).toBe('198.51.100.20');
    expect(trustedForwardedIp('10.0.0.1 , 2001:DB8::1')).toBe('2001:db8::1');
    expect(trustedForwardedIp('::ffff:192.0.2.1')).toBe('::ffff:192.0.2.1');
  });
  it('ignora cabeçalho ausente ou valores que não são endereços', () => {
    for (const value of [
      null,
      undefined,
      '',
      ' , ',
      'unknown',
      '1.2.3.4, evil<script>',
      'a'.repeat(60),
    ])
      expect(trustedForwardedIp(value)).toBeUndefined();
  });
});

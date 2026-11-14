import { describe, expect, it } from 'vitest';
import {
  endsInLabel,
  groupBuyInputSchema,
  groupBuyJoinable,
  groupDifferenceCents,
  groupUnitCents,
  participantInitials,
  remainingParticipants,
} from './group-buys';

const now = new Date('2026-11-14T12:00:00Z');
const h = (n: number) => new Date(now.getTime() + n * 3600_000);

describe('group buys', () => {
  it('prices by mode and goal', () => {
    expect(groupUnitCents('hold', false, 8990, 6990)).toBe(6990);
    expect(groupUnitCents('difference', false, 8990, 6990)).toBe(8990);
    expect(groupUnitCents('difference', true, 8990, 6990)).toBe(6990);
  });
  it('difference is per unit times quantity, never negative', () => {
    expect(groupDifferenceCents({ paidUnitCents: 8990, groupUnitCents: 6990, quantity: 2 })).toBe(
      4000,
    );
    expect(groupDifferenceCents({ paidUnitCents: 6990, groupUnitCents: 6990, quantity: 3 })).toBe(
      0,
    );
  });
  it('joinable only when active, open and inside the window', () => {
    const base = { active: true, status: 'Aberta', startsAt: h(-1), endsAt: h(5) } as const;
    expect(groupBuyJoinable(base, now)).toBe(true);
    expect(groupBuyJoinable({ ...base, status: 'Meta atingida' }, now)).toBe(true);
    expect(groupBuyJoinable({ ...base, active: false }, now)).toBe(false);
    expect(groupBuyJoinable({ ...base, status: 'Não fechou' }, now)).toBe(false);
    expect(groupBuyJoinable({ ...base, endsAt: h(-0.1) }, now)).toBe(false);
    expect(groupBuyJoinable({ ...base, startsAt: h(1) }, now)).toBe(false);
  });
  it('labels the deadline', () => {
    expect(endsInLabel(h(49), now)).toBe('termina em 2 dias');
    expect(endsInLabel(h(24), now)).toBe('termina em 1 dia');
    expect(endsInLabel(h(5), now)).toBe('termina em 5 horas');
    expect(endsInLabel(h(1), now)).toBe('termina em 1 hora');
    expect(endsInLabel(h(0.3), now)).toBe('termina em minutos');
    expect(endsInLabel(h(-1), now)).toBe('encerrada');
  });
  it('initials and remaining', () => {
    expect(participantInitials('Maria das Graças Souza')).toBe('MS');
    expect(participantInitials('joão')).toBe('J');
    expect(participantInitials('  ')).toBe('?');
    expect(remainingParticipants(10, 7)).toBe(3);
    expect(remainingParticipants(10, 12)).toBe(0);
  });
  it('rejects a cap below the goal', () => {
    const ok = {
      title: 'Natal',
      productId: 'p',
      sizeIndex: 0,
      groupPriceCents: 5000,
      goal: 5,
      maxParticipants: null,
      perPersonLimit: 2,
      mode: 'hold',
      endsAt: h(48).toISOString(),
      active: true,
    };
    expect(groupBuyInputSchema.parse(ok).description).toBe('');
    expect(() => groupBuyInputSchema.parse({ ...ok, maxParticipants: 4 })).toThrow();
  });
});

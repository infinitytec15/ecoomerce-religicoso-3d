import { describe, it, expect } from 'vitest';
import { renderEmail } from '@maos-em-oracao/emails';
import { brasiliaDay, dailyPrayers, prayerForDay } from './daily-prayers';

describe('oração diária automática', () => {
  it('escolhe a mesma oração para o mesmo dia e varia entre dias seguidos', () => {
    expect(prayerForDay('2026-11-13')).toBe(prayerForDay('2026-11-13'));
    const week = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map(
      (d) => prayerForDay(d).title,
    );
    expect(new Set(week).size).toBe(week.length);
  });
  it('não repete dentro de um ciclo completo da biblioteca', () => {
    const titles = Array.from({ length: dailyPrayers.length }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      return prayerForDay(d.toISOString().slice(0, 10)).title;
    });
    expect(new Set(titles).size).toBe(dailyPrayers.length);
  });
  it('usa o dia de Brasília, não o UTC', () => {
    // 01:30 UTC on the 14th is still the 13th in Brasília (UTC-3).
    expect(brasiliaDay(new Date('2026-11-14T01:30:00Z'))).toBe('2026-11-13');
  });
  it('toda oração cabe no e-mail e termina com Amém', () => {
    for (const p of dailyPrayers) {
      expect(p.prayer.trim().endsWith('Amém.')).toBe(true);
      expect(p.title.length).toBeLessThan(120);
      const rendered = renderEmail(
        {
          kind: 'daily-prayer',
          name: 'Leitora',
          title: p.title,
          prayer: p.prayer,
          reflection: p.reflection,
          dateLabel: '13/11/2026',
          actionUrl: 'https://loja.example/cantinho-da-fe',
          unsubscribeUrl: 'https://loja.example/oracao/descadastro?token=x',
          oneClickUnsubscribeUrl: 'https://loja.example/api/email/unsubscribe?token=x',
        },
        { webUrl: 'https://loja.example', supportEmail: 'ajuda@loja.example' },
      );
      expect(rendered.html).toContain(p.title);
    }
  });
});

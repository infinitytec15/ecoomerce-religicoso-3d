const ZONE = 'America/Sao_Paulo';
// Brasília has had no daylight saving time since 2019, so the offset is fixed.
const OFFSET = '-03:00';

/** "2026-11-20T09:30" typed in Brasília time -> ISO instant; null when incomplete or invalid. */
export function brasiliaToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const date = new Date(`${local}:00${OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Current Brasília wall-clock time as a datetime-local value (used as the minimum). */
export function nowBrasilia(now = new Date()): string {
  const shifted = new Date(now.getTime() - 3 * 3600_000);
  return shifted.toISOString().slice(0, 16);
}

export function formatBrasilia(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const dateLabel = (value: string) => {
  const date = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? 'A definir' : new Intl.DateTimeFormat('pt-BR').format(date);
};
export const monthLabel = (value: string) =>
  new Date(value.slice(0, 7) + '-15T12:00:00').toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addMonth(value: string, amount = 1) {
  const d = new Date(value.slice(0, 10) + 'T12:00:00'),
    day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
/**
 * Parses a money amount typed in pt-BR into cents. Accepts "49,90", "1.234,56", "6.000",
 * "129.90", "129" and an optional leading "R$". Unparseable input yields NaN (empty yields 0).
 */
export const centsFromInput = (value: string | number): number => {
  let text = String(value)
    .trim()
    .replace(/^R\$\s*/i, '')
    .trim();
  if (text.includes(',')) {
    if (!/^-?(\d{1,3}(\.\d{3})*|\d*),\d*$/.test(text)) return NaN;
    text = text.replaceAll('.', '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replaceAll('.', '');
  }
  if (text !== '' && !/^-?\d*\.?\d*$/.test(text)) return NaN;
  if (!/\d/.test(text) && text !== '') return NaN;
  return Math.round(Number(text) * 100);
};
/** Parses a plain decimal typed in pt-BR (comma accepted). Empty yields 0, invalid yields NaN. */
export const parseDecimal = (value: string): number => {
  const text = String(value).trim().replace(',', '.');
  if (text === '') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};
/** Parses a percentage typed in pt-BR (comma accepted). Empty or invalid input yields 0. */
export const parsePercent = (value: string): number => {
  const n = parseDecimal(value);
  return Number.isFinite(n) ? n : 0;
};
export const colorHex = (color: string) =>
  ({ Marfim: '#eee8db', Areia: '#cfc0a2', Terracota: '#b87150' })[color] || '#eee8db';
export function csvText(headers: string[], rows: (string | number | undefined)[][]) {
  const escape = (value: string | number | undefined) => {
    let s = String(value ?? '');
    if (typeof value === 'string' && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [headers, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
}
export function downloadCsv(
  name: string,
  headers: string[],
  rows: (string | number | undefined)[][],
) {
  const url = URL.createObjectURL(
    new Blob([csvText(headers, rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `maos-em-oracao-${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

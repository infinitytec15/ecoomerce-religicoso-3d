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
export const centsFromInput = (value: string | number) =>
  Math.round(Number(String(value).replace(',', '.')) * 100);
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

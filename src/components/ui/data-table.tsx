'use client';
import { useState, type ReactNode } from 'react';
import { Button } from './button';
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  pageSize = 10,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  caption?: string;
}) {
  const [page, setPage] = useState(1),
    maxPage = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, maxPage),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  return (
    <>
      <div className="admin-table-wrap" tabIndex={0} aria-label={caption || 'Tabela de registros'}>
        <table className="admin-table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c.key}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render(row)}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>
                  <div className="admin-empty">
                    Nenhum registro com esses filtros. Tente outro termo ou selecione Todos.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {maxPage > 1 && (
        <nav className="table-pagination" aria-label="Paginação da tabela">
          <span>
            {rows.length} registros · página {current} de {maxPage}
          </span>
          <Button
            variant="secondary"
            className="small"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            className="small"
            disabled={current === maxPage}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </Button>
        </nav>
      )}
    </>
  );
}
